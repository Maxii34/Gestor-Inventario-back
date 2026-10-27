import { prisma } from "../config/prisma";
import { ventaRepository } from "../repositores/venta.repository";
import { productoRepository } from "../repositores/producto.repository";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { clienteRepository } from "../repositores/cliente.repository";
import { MetodoPago } from "../generated/prisma/client";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors";

interface DetalleInput {
  productoId: number;
  cantidad: number;
}

export interface CrearVentaDTO {
  clienteId?: number;
  metodoPago: MetodoPago;
  detalles: DetalleInput[];
}

export interface ActualizarVentaDTO {
  clienteId?: number;
  metodoPago?: MetodoPago;
  estado?: "COMPLETADA" | "ANULADA";
}

export interface AnularVentaDTO {
  motivo: string;
}

// Función interna compartida: valida stock y arma los datos de detalle,
// sin tocar la base de datos todavía.
// Cada producto se lee dentro del comercio: uno ajeno da NotFoundError sin
// confirmar su existencia (el comercio del detalle lo fija la FK compuesta).
const construirDetalles = async (detalles: DetalleInput[], comercioId: number) => {
  let total = 0;
  const detallesData = [];

  for (const item of detalles) {
    const producto = await productoRepository.findById(item.productoId, comercioId);
    if (!producto) {
      throw new NotFoundError(`Producto ${item.productoId} no encontrado`);
    }
    if (producto.stock < item.cantidad) {
      throw new ConflictError(`Stock insuficiente para ${producto.nombre}`);
    }

    const precioUnitario = Number(producto.precioVenta);
    const subtotal = precioUnitario * item.cantidad;
    total += subtotal;

    detallesData.push({
      cantidad: item.cantidad,
      precioUnitario,
      subtotal,
      producto: { connect: { id: item.productoId } },
      comercio: { connect: { id: comercioId } },
    });
  }

  return { total, detallesData };
};

export const ventaService = {
  getAll: async (comercioId: number, page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [ventas, total] = await Promise.all([
      ventaRepository.findAll(comercioId, skip, limit),
      ventaRepository.count(comercioId),
    ]);

    return {
      data: ventas,
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  },

  getById: async (id: number, comercioId: number) => {
    const venta = await ventaRepository.findById(id, comercioId);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }
    return venta;
  },

  // Punto de entrada único: registra la venta directa en estado COMPLETADA.
  // El método de pago solo se registra; el sistema no procesa pagos.
  // El vendedorId queda registrado como autor (R-ROL-04).
  iniciarVenta: async (data: CrearVentaDTO, comercioId: number, vendedorId: number) => {
    return ventaService.crearVentaDirecta(data, comercioId, vendedorId);
  },

  // La venta se completa al instante con el método de pago informado.
  crearVentaDirecta: async (data: CrearVentaDTO, comercioId: number, vendedorId: number) => {
    const { total, detallesData } = await construirDetalles(data.detalles, comercioId);

    if (data.clienteId) {
      const cliente = await clienteRepository.findById(data.clienteId, comercioId);
      if (!cliente) {
        throw new NotFoundError("Cliente no encontrado");
      }
    }

    const venta = await prisma.$transaction(async (tx) => {
      for (const item of data.detalles) {
        // Descuento atómico y condicional: solo descuenta si hay stock
        // suficiente en ese instante. Dos ventas concurrentes no pueden dejar
        // stock negativo ni pisarse (la segunda ve `count === 0`).
        const descuento = await productoRepository.updateMany(
          { id: item.productoId, comercioId, stock: { gte: item.cantidad } },
          { stock: { decrement: item.cantidad } },
          tx
        );
        if (descuento.count === 0) {
          const producto = await productoRepository.findById(item.productoId, comercioId, tx);
          if (!producto) {
            throw new NotFoundError(`Producto ${item.productoId} no encontrado`);
          }
          throw new ConflictError(`Stock insuficiente para ${producto.nombre}`);
        }

        // Valores autoritativos post-escritura: dentro del tx se lee el propio
        // write, así el movimiento refleja la operación real y no una foto previa.
        const producto = await productoRepository.findById(item.productoId, comercioId, tx);
        if (!producto) {
          throw new NotFoundError(`Producto ${item.productoId} no encontrado`);
        }
        const stockNuevo = producto.stock;
        const stockAnterior = stockNuevo + item.cantidad;

        await movimientoRepository.create(
          {
            tipo: "SALIDA",
            cantidad: item.cantidad,
            stockAnterior,
            stockNuevo,
            motivo: "Venta",
            producto: { connect: { id: item.productoId } },
            comercio: { connect: { id: comercioId } },
          },
          tx
        );
      }

      return ventaRepository.create(
        {
          total,
          metodoPago: data.metodoPago,
          estado: "COMPLETADA",
          cliente: data.clienteId ? { connect: { id: data.clienteId } } : undefined,
          comercio: { connect: { id: comercioId } },
          vendedor: { connect: { id: vendedorId } },
          detalles: { create: detallesData },
        },
        tx
      );
    });

    return { ventaId: venta.id, initPoint: null };
  },

  // Modificación puntual de una venta PENDIENTE (ej: asignar cliente).
  // No es vía de cambio de estado: las transiciones van por la operación
  // explícita `anular`.
  // El rol ADMIN se exige en la ruta; acá se valida la compatibilidad de estado.
  update: async (id: number, comercioId: number, data: ActualizarVentaDTO) => {
    const venta = await ventaRepository.findById(id, comercioId);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }

    if (data.clienteId) {
      const cliente = await clienteRepository.findById(data.clienteId, comercioId);
      if (!cliente) {
        throw new NotFoundError("Cliente no encontrado");
      }
    }

    if (venta.estado !== "PENDIENTE") {
      throw new ConflictError(
        `No se puede modificar una venta en estado ${venta.estado}. Las ventas confirmadas solo pueden anularse mediante la operación explícita de anulación.`
      );
    }

    if (data.metodoPago !== undefined) {
      throw new ConflictError("No se puede cambiar el método de pago de una venta en curso");
    }

    if (data.estado === "COMPLETADA") {
      throw new ConflictError(
        "Una venta pendiente no puede completarse manualmente."
      );
    }

    if (data.estado === "ANULADA") {
      throw new ConflictError(
        "Para anular una venta usá la operación explícita de anulación (POST /ventas/:id/anular)"
      );
    }

    return ventaRepository.update(id, comercioId, data);
  },

  // Anulación explícita con motivo obligatorio.
  // - PENDIENTE → ANULADA directo (nunca descontó stock).
  // - COMPLETADA → ANULADA reponiendo stock con movimientos ENTRADA
  //   compensatorios, todo dentro de una transacción. El claim condicional
  //   (`updateMany` con `where` por estado) hace que dos anulaciones
  //   concurrentes no repongan stock dos veces: solo una reclama la transición.
  // - ANULADA / RECHAZADA: finales, no se pueden anular de nuevo.
  anular: async (id: number, comercioId: number, motivo: string, anuladoPorId: number) => {
    if (!motivo || motivo.trim() === "") {
      throw new BadRequestError("La anulación requiere un motivo");
    }
    const motivoLimpio = motivo.trim();

    const venta = await ventaRepository.findById(id, comercioId);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }

    if (venta.estado === "ANULADA" || venta.estado === "RECHAZADA") {
      throw new ConflictError(`No se puede anular una venta en estado ${venta.estado}`);
    }

    if (venta.estado === "PENDIENTE") {
      return ventaRepository.update(id, comercioId, {
        estado: "ANULADA",
        motivoAnulacion: motivoLimpio,
        fechaAnulacion: new Date(),
        anuladoPor: { connect: { id: anuladoPorId } },
      });
    }

    return prisma.$transaction(async (tx) => {
      const actual = await ventaRepository.findById(id, comercioId, tx);
      if (!actual) {
        throw new NotFoundError("Venta no encontrada");
      }
      if (actual.estado !== "COMPLETADA") {
        throw new ConflictError(
          `No se puede anular una venta en estado ${actual.estado}`
        );
      }

      // Foto de existencia antes del claim: si un producto falta, se aborta sin
      // haber cambiado el estado (el claim viene después).
      const reposiciones: { productoId: number; cantidad: number }[] = [];
      for (const detalle of actual.detalles) {
        const producto = await productoRepository.findById(detalle.productoId, comercioId, tx);
        if (!producto) {
          throw new NotFoundError(`Producto ${detalle.productoId} no encontrado`);
        }
        reposiciones.push({
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
        });
      }

      const claim = await ventaRepository.updateMany(
        { id, comercioId, estado: "COMPLETADA" },
        {
          estado: "ANULADA",
          motivoAnulacion: motivoLimpio,
          fechaAnulacion: new Date(),
          anuladoPorId,
        },
        tx
      );
      if (claim.count === 0) {
        throw new ConflictError("La venta ya fue anulada o cambió de estado");
      }

      for (const repo of reposiciones) {
        // `increment` atómico + registro devuelto por Prisma: `stockNuevo` es el
        // valor realmente escrito y `stockAnterior` se deriva de él, sin fotos previas.
        const actualizado = await productoRepository.update(
          repo.productoId,
          comercioId,
          { stock: { increment: repo.cantidad } },
          tx
        );
        const stockNuevo = actualizado.stock;
        const stockAnterior = stockNuevo - repo.cantidad;

        await movimientoRepository.create(
          {
            tipo: "ENTRADA",
            cantidad: repo.cantidad,
            stockAnterior,
            stockNuevo,
            motivo: `Anulación venta #${id}: ${motivoLimpio}`,
            producto: { connect: { id: repo.productoId } },
            comercio: { connect: { id: comercioId } },
          },
          tx
        );
      }

      return ventaRepository.findById(id, comercioId, tx);
    });
  },

  // Borrado físico prohibido: preserva detalles y movimientos históricos.
  // La vía de egreso es la anulación explícita.
  delete: async (id: number, comercioId: number) => {
    const venta = await ventaRepository.findById(id, comercioId);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }

    throw new ConflictError(
      "No se puede eliminar una venta. Para dar de baja una venta usá la operación explícita de anulación (POST /ventas/:id/anular)."
    );
  },
};
