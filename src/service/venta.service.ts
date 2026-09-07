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
    let total = 0;
    const detallesData = [];

    for (const item of data.detalles) {
      const producto = await productoRepository.findById(item.productoId);
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

      await productoRepository.update(item.productoId, { stock: stockNuevo });

      await movimientoRepository.create({
        tipo: "SALIDA",
        cantidad: item.cantidad,
        stockAnterior,
        stockNuevo,
        motivo: "Venta",
        producto: { connect: { id: item.productoId } },
      });
    }

    return ventaRepository.create({
      total,
      metodoPago: data.metodoPago,
      cliente: data.clienteId ? { connect: { id: data.clienteId } } : undefined,
      detalles: { create: detallesData },
    });
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
