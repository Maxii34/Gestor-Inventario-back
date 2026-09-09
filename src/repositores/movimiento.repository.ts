import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const movimientoRepository = {
  findAll: (skip?: number, take?: number) =>
    prisma.movimientoStock.findMany({
      skip,
      take,
      orderBy: { fecha: "desc" }, // más recientes primero, y evita resultados inconsistentes entre páginas
      include: { producto: true },
    }),

  count: () => prisma.movimientoStock.count(),

  findById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.findUnique({
      where: { id },
      include: { producto: true },
    }),

  create: (data: Prisma.MovimientoStockCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.create({ data }),

  update: (id: number, data: Prisma.MovimientoStockUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.delete({ where: { id } }),
};