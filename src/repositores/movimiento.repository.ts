import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export const movimientoRepository = {
  findAll: () => prisma.movimientoStock.findMany(),

  findById: (id: number) =>
    prisma.movimientoStock.findUnique({
      where: { id },
      include: { producto: true },
    }),

  create: (data: Prisma.MovimientoStockCreateInput) =>
    prisma.movimientoStock.create({ data }),

  update: (id: number, data: Prisma.MovimientoStockUpdateInput) =>
    prisma.movimientoStock.update({ where: { id }, data }),

  delete: (id: number) => prisma.movimientoStock.delete({ where: { id } }),
};
