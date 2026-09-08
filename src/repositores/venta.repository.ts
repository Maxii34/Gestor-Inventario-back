import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient; // alias para no repetir el tipo largo en cada método

export const ventaRepository = {
  findAll: () => prisma.venta.findMany({ include: { detalles: true, cliente: true } }),

  findById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findUnique({
      where: { id },
      include: { detalles: { include: { producto: true } }, cliente: true },
    }),

  create: (data: Prisma.VentaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.create({ data, include: { detalles: true } }),

  update: (id: number, data: Prisma.VentaUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.update({ where: { id }, data }),

  delete: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.delete({ where: { id } }),
};