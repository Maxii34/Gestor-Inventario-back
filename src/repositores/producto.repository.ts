import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const productoRepository = {
  findAll: (skip?: number, take?: number) =>
    prisma.producto.findMany({
      skip,
      take,
      orderBy: { id: "asc" },
      include: { categoria: true },
    }),

  count: () => prisma.producto.count(),

  findById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).producto.findUnique({ where: { id }, include: { categoria: true } }),

  create: (data: Prisma.ProductoUncheckedCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).producto.create({ data }),

  update: (id: number, data: Prisma.ProductoUncheckedUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).producto.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).producto.delete({ where: { id } }),
};