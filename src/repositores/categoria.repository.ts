import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const categoriaRepository = {
  findAll: (comercioId: number) =>
    prisma.categoria.findMany({ where: { comercioId } }),

  findById: (id: number, comercioId: number) =>
    prisma.categoria.findFirst({
      where: { id, comercioId },
      include: { productos: true },
    }),

  create: (data: Prisma.CategoriaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).categoria.create({ data }),

  update: (id: number, data: Prisma.CategoriaUpdateInput) =>
    prisma.categoria.update({ where: { id }, data }),

  delete: (id: number) => prisma.categoria.delete({ where: { id } }),
};
