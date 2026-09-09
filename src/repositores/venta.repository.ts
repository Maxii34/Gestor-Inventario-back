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

  create: (data: Prisma.VentaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.create({ data, include: { detalles: true } }),

  update: (id: number, data: Prisma.VentaUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.delete({ where: { id } }),
};