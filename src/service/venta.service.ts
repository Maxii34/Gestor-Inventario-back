import { prisma } from "../config/prisma"; // necesario para usar prisma.$transaction
import { ventaRepository } from "../repositores/venta.repository";
import { productoRepository } from "../repositores/producto.repository";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { clienteRepository } from "../repositores/cliente.repository";
import { MetodoPago } from "../generated/prisma/client";

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
  getAll: () => ventaRepository.findAll(),

  getById: async (id: number) => {
    const venta = await ventaRepository.findById(id);
    if (!venta) {
      throw new Error("Venta no encontrada");
    }
    return venta;
  },

  create: async (data: CrearVentaDTO) => {
    // TRANSACCIÓN GRANDE: agrupa TODO el proceso de la venta (validar stock,
    // descontarlo, crear cada movimiento, y crear la venta con sus detalles).
    // Si cualquier ítem del array "detalles" (los productos de ESTA venta puntual,
    // no hay carrito persistente en este proyecto) falla -ej: sin stock en el
    // ítem 3 de 5- Prisma revierte TODO lo anterior: ningún producto queda con
    // stock descontado y no se crea ningún movimiento huérfano.
    const venta = await prisma.$transaction(async (tx) => {
      let total = 0;
      const detallesData = [];

      for (const item of data.detalles) {
        // lectura y validación del producto (usando tx para ver datos consistentes
        // dentro de la misma transacción, no una copia vieja)
        const producto = await productoRepository.findById(item.productoId, tx);
        if (!producto) {
          throw new Error(`Producto ${item.productoId} no encontrado`);
        }
        if (producto.stock < item.cantidad) {
          throw new Error(`Stock insuficiente para ${producto.nombre}`);
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

        const stockAnterior = producto.stock;
        const stockNuevo = stockAnterior - item.cantidad;

        // descuento de stock DENTRO de la transacción
        await productoRepository.update(
          item.productoId,
          { stock: stockNuevo },
          tx,
        );

        // registro del movimiento DENTRO de la misma transacción
        await movimientoRepository.create(
          {
            tipo: "SALIDA",
            cantidad: item.cantidad,
            stockAnterior,
            stockNuevo,
            motivo: "Venta",
            producto: { connect: { id: item.productoId } },
          },
          tx,
        );
      }

      // la venta y sus detalles se crean recién al final, también dentro de tx
      return ventaRepository.create(
        {
          total,
          metodoPago: data.metodoPago,
          cliente: data.clienteId
            ? { connect: { id: data.clienteId } }
            : undefined,
          detalles: { create: detallesData },
        },
        tx,
      );
    });

    return venta;
  },

  update: async (id: number, data: ActualizarVentaDTO) => {
    const venta = await ventaRepository.findById(id);
    if (!venta) {
      throw new Error("Venta no encontrada");
    }

    if (data.clienteId) {
      const cliente = await clienteRepository.findById(data.clienteId);
      if (!cliente) {
        throw new Error("Cliente no encontrado");
      }
    }

    return ventaRepository.update(id, data);
  },

  delete: async (id: number) => {
    const venta = await ventaRepository.findById(id);
    if (!venta) {
      throw new Error("Venta no encontrada");
    }

    return ventaRepository.delete(id);
  },
};
