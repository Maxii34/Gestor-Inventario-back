import { prisma } from "../config/prisma";
import { EstadoVenta, MetodoPago, Prisma } from "../generated/prisma/client";
import { finDeDiaArgentina, inicioDeDiaArgentina } from "../utils/fechas";

type PrismaTx = Prisma.TransactionClient;

export interface FiltrosVenta {
  vendedorId?: number;
  desde?: string;
  hasta?: string;
  estado?: EstadoVenta;
  metodoPago?: MetodoPago;
}

// Único constructor del where de ventas: findAll y count lo comparten para que
// el listado y el total paginado nunca se calculen con filtros distintos.
export const construirWhereVentas = (
  comercioId: number,
  filtros: FiltrosVenta = {}
): Prisma.VentaWhereInput => {
  const where: Prisma.VentaWhereInput = { comercioId };

  if (filtros.vendedorId !== undefined) {
    where.vendedorId = filtros.vendedorId;
  }
  if (filtros.estado !== undefined) {
    where.estado = filtros.estado;
  }
  if (filtros.metodoPago !== undefined) {
    where.metodoPago = filtros.metodoPago;
  }
  if (filtros.desde !== undefined || filtros.hasta !== undefined) {
    const fecha: Prisma.DateTimeFilter = {};
    if (filtros.desde !== undefined) {
      fecha.gte = inicioDeDiaArgentina(filtros.desde);
    }
    if (filtros.hasta !== undefined) {
      fecha.lte = finDeDiaArgentina(filtros.hasta);
    }
    where.fecha = fecha;
  }

  return where;
};

export const ventaRepository = {
  findAll: (
    comercioId: number,
    skip?: number,
    take?: number,
    filtros: FiltrosVenta = {}
  ) =>
    prisma.venta.findMany({
      where: construirWhereVentas(comercioId, filtros),
      skip,
      take,
      orderBy: { fecha: "desc" },
      include: {
        detalles: true,
        cliente: true,
        vendedor: { select: { id: true, nombre: true, rol: true } },
        anuladoPor: { select: { id: true, nombre: true, rol: true } },
      },
    }),

  count: (comercioId: number, filtros: FiltrosVenta = {}) =>
    prisma.venta.count({ where: construirWhereVentas(comercioId, filtros) }),

  findById: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findFirst({
      where: { id, comercioId },
      include: {
        detalles: { include: { producto: true } },
        cliente: true,
        vendedor: { select: { id: true, nombre: true, rol: true } },
        anuladoPor: { select: { id: true, nombre: true, rol: true } },
      },
    }),

  create: (data: Prisma.VentaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.create({ data, include: { detalles: true } }),

  update: (id: number, comercioId: number, data: Prisma.VentaUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.update({ where: { id, comercioId }, data }),

  // Actualización condicional por estado: se usa para reclamar transiciones
  // (ej: anular) de forma atómica y evitar dobles operaciones concurrentes.
  updateMany: (where: Prisma.VentaWhereInput, data: Prisma.VentaUncheckedUpdateManyInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.updateMany({ where, data }),

  delete: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.delete({ where: { id, comercioId } }),

  //suma el total de ventas COMPLETADA dentro de un rango de fechas.
  sumarRecaudacion: (comercioId: number, desde: Date, hasta: Date) =>
    prisma.venta.aggregate({
      where: {
        comercioId,
        estado: "COMPLETADA",
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { total: true },
    }),
};
