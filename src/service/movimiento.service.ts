import { prisma } from "../config/prisma";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { productoRepository } from "../repositores/producto.repository";
import { TipoMovimiento } from "../generated/prisma/client";
import { NotFoundError, ConflictError } from "../utils/errors";

export interface CrearMovimientoDTO {
  tipo: TipoMovimiento;
  cantidad: number;
  productoId: number;
  motivo?: string;
}

export interface ActualizarMovimientoDTO {
  motivo?: string;
}

export const movimientoService = {
  getAll: async (comercioId: number, page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [movimientos, total] = await Promise.all([
      movimientoRepository.findAll(comercioId, skip, limit),
      movimientoRepository.count(comercioId),
    ]);

    return {
      data: movimientos,
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  },

  getById: async (id: number, comercioId: number) => {
    const movimiento = await movimientoRepository.findById(id, comercioId);
    if (!movimiento) {
      throw new NotFoundError("Movimiento no encontrado");
    }
    return movimiento;
  },

  create: async (data: CrearMovimientoDTO, comercioId: number, responsableId?: number) => {
    // El producto debe pertenecer al comercio del solicitante: de otro modo
    // se responde 404 sin confirmar si existe.
    const producto = await productoRepository.findById(data.productoId, comercioId);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }

    // Validación rápida previa (UX): la garantía real está dentro del tx.
    const stockPrevio = producto.stock;
    if (data.tipo === "SALIDA" && stockPrevio - data.cantidad < 0) {
      throw new ConflictError("Stock insuficiente");
    }

    const movimiento = await prisma.$transaction(async (tx) => {
      let stockNuevo: number;
      let stockAnterior: number;

      if (data.tipo === "ENTRADA") {
        // `increment` + registro devuelto: sin fotos previas ni updates perdidos.
        const actualizado = await productoRepository.update(
          data.productoId,
          { stock: { increment: data.cantidad } },
          tx
        );
        stockNuevo = actualizado.stock;
        stockAnterior = stockNuevo - data.cantidad;
      } else if (data.tipo === "SALIDA") {
        // Descuento atómico y condicional: concurrentes no generan negativo.
        const descuento = await productoRepository.updateMany(
          { id: data.productoId, comercioId, stock: { gte: data.cantidad } },
          { stock: { decrement: data.cantidad } },
          tx
        );
        if (descuento.count === 0) {
          throw new ConflictError("Stock insuficiente");
        }
        const actual = await productoRepository.findById(data.productoId, comercioId, tx);
        if (!actual) {
          throw new NotFoundError("Producto no encontrado");
        }
        stockNuevo = actual.stock;
        stockAnterior = stockNuevo + data.cantidad;
      } else {
        // AJUSTE fija valor absoluto por definición; el nuevo es el escrito.
        const actualizado = await productoRepository.update(
          data.productoId,
          { stock: data.cantidad },
          tx
        );
        stockAnterior = stockPrevio;
        stockNuevo = actualizado.stock;
      }

      return movimientoRepository.create(
        {
          tipo: data.tipo,
          cantidad: data.cantidad,
          stockAnterior,
          stockNuevo,
          motivo: data.motivo,
          producto: { connect: { id: data.productoId } },
          comercio: { connect: { id: comercioId } },
          ...(responsableId !== undefined
            ? { responsable: { connect: { id: responsableId } } }
            : {}),
        },
        tx
      );
    });

    return movimiento;
  },

  update: async (id: number, comercioId: number, data: ActualizarMovimientoDTO) => {
    const movimiento = await movimientoRepository.findById(id, comercioId);
    if (!movimiento) {
      throw new NotFoundError("Movimiento no encontrado");
    }
    return movimientoRepository.update(id, data);
  },

  delete: async (id: number, comercioId: number) => {
    const movimiento = await movimientoRepository.findById(id, comercioId);
    if (!movimiento) {
      throw new NotFoundError("Movimiento no encontrado");
    }
    return movimientoRepository.delete(id);
  },
};
