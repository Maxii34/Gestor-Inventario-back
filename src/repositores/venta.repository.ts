import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export const ventaRepository = {
  findAll: () => prisma.venta.findMany({ include: { detalles: true, cliente: true } }),

  findById: (id: number) =>
    prisma.venta.findUnique({
      where: { id },
      include: { detalles: { include: { producto: true } }, cliente: true },
    }),

  create: (data: Prisma.VentaCreateInput) =>
    prisma.venta.create({ data, include: { detalles: true } }),

  update: (id: number, data: Prisma.VentaUpdateInput) =>
    prisma.venta.update({ where: { id }, data }),

  delete: (id: number) => prisma.venta.delete({ where: { id } }),
};