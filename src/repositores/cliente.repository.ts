import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export const clienteRepository = {
  findAll: () => prisma.cliente.findMany({ where: { activo: true } }),

  findById: (id: number) =>
    prisma.cliente.findUnique({
      where: { id },
      include: { ventas: true },
    }),

  create: (data: Prisma.ClienteCreateInput) =>
    prisma.cliente.create({ data }),

  update: (id: number, data: Prisma.ClienteUpdateInput) =>
    prisma.cliente.update({ where: { id }, data }),

  delete: (id: number) =>
    prisma.cliente.update({ where: { id }, data: { activo: false } }),
};