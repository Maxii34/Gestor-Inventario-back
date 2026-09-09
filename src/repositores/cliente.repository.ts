import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient; // mismo patrón: cliente opcional para transacciones

export const clienteRepository = {
  findAll: () => prisma.cliente.findMany({ where: { activo: true } }),

  findById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.findUnique({
      where: { id },
      include: { ventas: true },
    }),

  create: (data: Prisma.ClienteCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.create({ data }),

  update: (id: number, data: Prisma.ClienteUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.update({ where: { id }, data: { activo: false } }),
};