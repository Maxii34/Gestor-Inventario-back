import { movimientoRepository } from "../repositores/movimiento.repository";
import { productoRepository } from "../repositores/producto.repository";
import { TipoMovimiento } from "../generated/prisma/client";

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
  getAll: () => movimientoRepository.findAll(),

  getById: async (id: number) => {
    const movimiento = await movimientoRepository.findById(id);
    if (!movimiento) {
      throw new Error("Movimiento no encontrado");
    }
    return movimiento;
  },

  create: async (data: CrearMovimientoDTO) => {
    const producto = await productoRepository.findById(data.productoId);
    if (!producto) {
      throw new Error("Producto no encontrado");
    }

    const stockAnterior = producto.stock;
    let stockNuevo = stockAnterior;

    if (data.tipo === "ENTRADA") {
      stockNuevo = stockAnterior + data.cantidad;
    } else if (data.tipo === "SALIDA") {
      stockNuevo = stockAnterior - data.cantidad;
      if (stockNuevo < 0) {
        throw new Error("Stock insuficiente");
      }
    } else if (data.tipo === "AJUSTE") {
      stockNuevo = data.cantidad; // ajuste directo al valor indicado
    }

    // actualizar stock del producto
    await productoRepository.update(data.productoId, { stock: stockNuevo });

    // crear el movimiento con los valores calculados
    return movimientoRepository.create({
      tipo: data.tipo,
      cantidad: data.cantidad,
      stockAnterior,
      stockNuevo,
      motivo: data.motivo,
      producto: { connect: { id: data.productoId } },
    });
  },

  update: (id: number, data: ActualizarMovimientoDTO) =>
    movimientoRepository.update(id, data),

  // Nota: borrar un movimiento no revierte el efecto que tuvo sobre el stock
  // del producto. Si más adelante necesitás esa integridad, avisame y lo
  // resolvemos con una transacción (leer el movimiento, revertir el stock,
  // recién ahí borrar).
  delete: (id: number) => movimientoRepository.delete(id),
};