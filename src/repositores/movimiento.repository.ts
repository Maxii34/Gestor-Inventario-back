import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const movimientoRepository = {
  findAll: (comercioId: number, skip?: number, take?: number) =>
    prisma.movimientoStock.findMany({
      where: { comercioId },
      skip,
      take,
      orderBy: { fecha: "desc" }, // más recientes primero, y evita resultados inconsistentes entre páginas
      include: { producto: true },
    }),

  count: (comercioId: number) => prisma.movimientoStock.count({ where: { comercioId } }),

  findById: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.findFirst({
      where: { id, comercioId },
      include: { producto: true },
    }),

  create: (data: Prisma.MovimientoStockCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.create({ data }),

  update: (id: number, data: Prisma.MovimientoStockUpdateInput) =>
    prisma.movimientoStock.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).movimientoStock.delete({ where: { id } }),
};
