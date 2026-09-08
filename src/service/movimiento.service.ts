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
  getAll: () => movimientoRepository.findAll(),

  getById: async (id: number) => {
    const movimiento = await movimientoRepository.findById(id);
    if (!movimiento) {
      throw new NotFoundError("Movimiento no encontrado"); 
    }
    return movimiento;
  },

  create: async (data: CrearMovimientoDTO) => {
    // fuera de la transacción: solo es una lectura, no modifica nada todavía
    const producto = await productoRepository.findById(data.productoId);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }

    const stockAnterior = producto.stock;
    let stockNuevo = stockAnterior;

    if (data.tipo === "ENTRADA") {
      stockNuevo = stockAnterior + data.cantidad;
    } else if (data.tipo === "SALIDA") {
      stockNuevo = stockAnterior - data.cantidad;
      if (stockNuevo < 0) {
        throw new ConflictError("Stock insuficiente"); // conflicto de negocio, no dato inválido
      }
    } else if (data.tipo === "AJUSTE") {
      stockNuevo = data.cantidad; // ajuste directo al valor indicado
    }

    // TRANSACCIÓN: agrupa el update de stock + el create del movimiento.
    // Si cualquiera de las dos falla, Prisma revierte ambas (rollback automático).
    const movimiento = await prisma.$transaction(async (tx) => {
      await productoRepository.update(data.productoId, { stock: stockNuevo }, tx);

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

  update: async (id: number, data: ActualizarMovimientoDTO) => {
    const movimiento = await movimientoRepository.findById(id);
    if (!movimiento) {
      throw new NotFoundError("Movimiento no encontrado");
    }
    return movimientoRepository.update(id, data);
  },

  // Nota: borrar un movimiento no revierte el efecto que tuvo sobre el stock
  // del producto.
  delete: async (id: number) => {
    const movimiento = await movimientoRepository.findById(id);
    if (!movimiento) {
      throw new NotFoundError("Movimiento no encontrado");
    }
    return movimientoRepository.delete(id);
  },
};