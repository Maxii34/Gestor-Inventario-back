import { Preference, Payment } from "mercadopago";
import mpClient from "../config/mercadopago";
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

export const ventaService = {
  getAll: async (page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [ventas, total] = await Promise.all([
      ventaRepository.findAll(skip, limit),
      ventaRepository.count(),
    ]);

    return {
      data: ventas,
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  },

  getById: async (id: number) => {
    const venta = await ventaRepository.findById(id);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }
    return venta;
  },

  // arma la venta en estado PENDIENTE (sin tocar
  // stock) y genera la preferencia de pago en Mercado Pago.
  iniciarVenta: async (data: CrearVentaDTO) => {
    let total = 0;
    const detallesData = [];
    const itemsParaMP = [];

    // Solo lectura y cálculo, no se toca stock ni se crea nada todavía
    for (const item of data.detalles) {
      const producto = await productoRepository.findById(item.productoId);
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
      });

      itemsParaMP.push({
        id: String(producto.id),
        title: producto.nombre,
        quantity: item.cantidad,
        currency_id: "ARS",
        unit_price: precioUnitario,
      });
    }

    // Se crea la venta en estado PENDIENTE (default del schema), sin tocar stock
    const venta = await ventaRepository.create({
      total,
      metodoPago: data.metodoPago,
      cliente: data.clienteId ? { connect: { id: data.clienteId } } : undefined,
      detalles: { create: detallesData },
    });

    // Se genera la preferencia en MP usando el id de la venta como referencia
    const preferenceClient = new Preference(mpClient);
    const preferencia = await preferenceClient.create({
      body: {
        items: itemsParaMP,
        external_reference: String(venta.id),
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pago-exitoso`,
          failure: `${process.env.FRONTEND_URL}/pago-fallido`,
          pending: `${process.env.FRONTEND_URL}/pago-pendiente`,
        },
        notification_url: `${process.env.BACKEND_URL}/ventas/webhook`,
      },
    });

    // Guardamos el id de la preferencia para trazabilidad
    await ventaRepository.update(venta.id, {
      mercadoPagoPreferenceId: preferencia.id,
    });

    return {
      ventaId: venta.id,
      initPoint: preferencia.init_point,
    };
  },

  // Llamado desde el webhook cuando llega una notificación de pago.
  // Nunca confía en el contenido del webhook a ciegas: siempre re-consulta
  // el pago real a la API de Mercado Pago antes de actuar.
  confirmarPago: async (paymentId: string) => {
    const paymentClient = new Payment(mpClient);
    const payment = await paymentClient.get({ id: paymentId });

    const ventaId = Number(payment.external_reference);
    if (!ventaId) {
      throw new BadRequestError("El pago no tiene una referencia de venta válida");
    }

    const venta = await ventaRepository.findById(ventaId);
    if (!venta) {
      throw new NotFoundError(`Venta ${ventaId} no encontrada`);
    }

    // Si ya no está pendiente, el webhook ya fue procesado antes (MP puede
    // reenviar notificaciones duplicadas). No hacemos nada más.
    if (venta.estado !== "PENDIENTE") {
      return venta;
    }

    if (payment.status === "approved") {
      // TRANSACCIÓN: recién acá, con el pago confirmado, se valida stock de
      // nuevo (pudo cambiar desde que se inició la venta) y se descuenta.
      const ventaActualizada = await prisma.$transaction(async (tx) => {
        for (const detalle of venta.detalles) {
          const producto = await productoRepository.findById(detalle.productoId, tx);
          if (!producto) {
            throw new NotFoundError(`Producto ${detalle.productoId} no encontrado`);
          }
          if (producto.stock < detalle.cantidad) {
            throw new ConflictError(`Stock insuficiente para ${producto.nombre}`);
          }

          const stockAnterior = producto.stock;
          const stockNuevo = stockAnterior - detalle.cantidad;

          await productoRepository.update(detalle.productoId, { stock: stockNuevo }, tx);

          await movimientoRepository.create(
            {
              tipo: "SALIDA",
              cantidad: detalle.cantidad,
              stockAnterior,
              stockNuevo,
              motivo: "Venta (Mercado Pago)",
              producto: { connect: { id: detalle.productoId } },
            },
            tx
          );
        }

        return ventaRepository.update(
          venta.id,
          { estado: "COMPLETADA", mercadoPagoPaymentId: String(payment.id) },
          tx
        );
      });

      return ventaActualizada;
    }

    if (payment.status === "rejected") {
      return ventaRepository.update(venta.id, {
        estado: "RECHAZADA",
        mercadoPagoPaymentId: String(payment.id),
      });
    }

    // Otros estados (pending, in_process, etc.) no se procesan todavía;
    // se espera un próximo webhook con el estado final.
    return venta;
  },

  update: async (id: number, data: ActualizarVentaDTO) => {
    const venta = await ventaRepository.findById(id);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }

    if (data.clienteId) {
      const cliente = await clienteRepository.findById(data.clienteId);
      if (!cliente) {
        throw new NotFoundError("Cliente no encontrado");
      }
    }

    return ventaRepository.update(id, data);
  },

  delete: async (id: number) => {
    const venta = await ventaRepository.findById(id);
    if (!venta) {
      throw new NotFoundError("Venta no encontrada");
    }

    return ventaRepository.delete(id);
  },
};