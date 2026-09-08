import { prisma } from "../config/prisma"; // necesario para poder usar prisma.$transaction
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
    // fuera de la transacción: solo es una lectura, no modifica nada todavía
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

    // TRANSACCIÓN: agrupa el update de stock + el create del movimiento.
    // Si cualquiera de las dos falla, Prisma revierte ambas (rollback automático).
    // "tx" es el cliente especial que hay que pasarle a cada repository para
    // que la operación quede DENTRO de este grupo atómico.
    const movimiento = await prisma.$transaction(async (tx) => {
      // actualizar stock del producto (usando tx, no el prisma global)
      await productoRepository.update(data.productoId, { stock: stockNuevo }, tx);

      // crear el movimiento con los valores calculados (usando tx también)
      return movimientoRepository.create(
        {
          tipo: data.tipo,
          cantidad: data.cantidad,
          stockAnterior,
          stockNuevo,
          motivo: data.motivo,
          producto: { connect: { id: data.productoId } },
        },
        tx
      );
    });

    return movimiento;
  },

  update: (id: number, data: ActualizarMovimientoDTO) =>
    movimientoRepository.update(id, data),

  // Nota: borrar un movimiento no revierte el efecto que tuvo sobre el stock
  // del producto.
  delete: (id: number) => movimientoRepository.delete(id),
};