import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export const productoRepository = {
  findAll: () => prisma.producto.findMany({ include: { categoria: true } }),

  findById: (id: number) => prisma.producto.findUnique({ where: { id }, include: {categoria: true } }),

  create: (data: Prisma.ProductoUncheckedCreateInput) =>
    prisma.producto.create({ data }),

  update: (id: number, data: Prisma.ProductoUncheckedUpdateInput) =>
    prisma.producto.update({ where: { id }, data }),

  delete: (id: number) => prisma.producto.delete({ where: { id } }),
};
