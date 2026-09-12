import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const ventaRepository = {
  findAll: (skip?: number, take?: number) =>
    prisma.venta.findMany({
      skip,
      take,
      orderBy: { fecha: "desc" },
      include: { detalles: true, cliente: true },
    }),

  count: () => prisma.venta.count(),

  findById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findUnique({
      where: { id },
      include: { detalles: { include: { producto: true } }, cliente: true },
    }),

  // Nuevo: el webhook de Mercado Pago no conoce el id interno de la venta,
  // solo el external_reference que le mandamos al crear la preferencia.
  // Este método la busca por ese dato.
  findByPreferenceId: (preferenceId: string, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findFirst({
      where: { mercadoPagoPreferenceId: preferenceId },
      include: { detalles: { include: { producto: true } } },
    }),

  create: (data: Prisma.VentaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.create({ data, include: { detalles: true } }),

  update: (id: number, data: Prisma.VentaUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.delete({ where: { id } }),

  //suma el total de ventas COMPLETADA dentro de un rango de fechas.
  sumarRecaudacion: (desde: Date, hasta: Date) =>
    prisma.venta.aggregate({
      where: {
        estado: "COMPLETADA",
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { total: true },
    }),
};
