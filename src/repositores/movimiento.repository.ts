import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const movimientoRepository = {
  findAll: () => prisma.movimientoStock.findMany(),

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