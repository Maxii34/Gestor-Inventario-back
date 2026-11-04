import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

const construirWhere = (
  comercioId: number,
  q?: string
): Prisma.CategoriaWhereInput => ({
  comercioId,
  ...(q
    ? { nombre: { contains: q, mode: "insensitive" } }
    : {}),
});

export const categoriaRepository = {
  findAll: (comercioId: number, skip: number, take: number, q?: string) =>
    prisma.categoria.findMany({
      where: construirWhere(comercioId, q),
      skip,
      take,
      orderBy: { id: "asc" },
    }),

  count: (comercioId: number, q?: string) =>
    prisma.categoria.count({ where: construirWhere(comercioId, q) }),

  findById: (id: number, comercioId: number) =>
    prisma.categoria.findFirst({
      where: { id, comercioId },
      include: { productos: true },
    }),

  findAllParaCargaMasiva: (comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).categoria.findMany({
      where: { comercioId },
      select: { id: true, nombre: true },
    }),

  create: (data: Prisma.CategoriaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).categoria.create({ data }),

  update: (id: number, comercioId: number, data: Prisma.CategoriaUpdateInput) =>
    prisma.categoria.update({ where: { id, comercioId }, data }),

  delete: (id: number, comercioId: number) =>
    prisma.categoria.delete({ where: { id, comercioId } }),
};
