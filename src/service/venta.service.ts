import { prisma } from "../config/prisma";
import { ventaRepository } from "../repositores/venta.repository";
import { productoRepository } from "../repositores/producto.repository";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { clienteRepository } from "../repositores/cliente.repository";
import { MetodoPago } from "../generated/prisma/client";
import { NotFoundError, ConflictError } from "../utils/errors";

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

  create: async (data: CrearVentaDTO) => {
    const venta = await prisma.$transaction(async (tx) => {
      let total = 0;
      const detallesData = [];

      for (const item of data.detalles) {
        const producto = await productoRepository.findById(item.productoId, tx);
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

        const stockAnterior = producto.stock;
        const stockNuevo = stockAnterior - item.cantidad;

        await productoRepository.update(
          item.productoId,
          { stock: stockNuevo },
          tx,
        );

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