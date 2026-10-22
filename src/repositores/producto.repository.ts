import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const productoRepository = {
  findAll: (comercioId: number, skip?: number, take?: number) =>
    prisma.producto.findMany({
      where: { comercioId },
      skip,
      take,
      orderBy: { id: "asc" },
      include: { categoria: true },
    }),

  count: (comercioId: number) => prisma.producto.count({ where: { comercioId } }),

  findById: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).producto.findFirst({
      where: { id, comercioId },
      include: { categoria: true },
    }),

  create: (data: Prisma.ProductoCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).producto.create({ data }),

  update: (
    id: number,
    comercioId: number,
    data: Prisma.ProductoUncheckedUpdateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).producto.update({ where: { id, comercioId }, data }),

  // Actualización condicional (ej: `where: { id, comercioId, stock: { gte: n } }`
  // con `data: { stock: { decrement: n } }`): el descuento ocurre o no de forma
  // atómica, sin leer-escribir por separado. Devuelve `{ count }`.
  updateMany: (
    where: Prisma.ProductoWhereInput,
    data: Prisma.ProductoUncheckedUpdateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).producto.updateMany({ where, data }),

  delete: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).producto.delete({ where: { id, comercioId } }),
};
