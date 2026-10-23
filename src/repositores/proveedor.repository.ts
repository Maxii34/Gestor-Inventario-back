import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const proveedorRepository = {
  findAll: (comercioId: number, skip?: number, take?: number) =>
    prisma.proveedor.findMany({
      where: { comercioId, activo: true },
      skip,
      take,
      orderBy: { id: "asc" },
    }),

  count: (comercioId: number) =>
    prisma.proveedor.count({ where: { comercioId, activo: true } }),

  findById: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).proveedor.findFirst({ where: { id, comercioId, activo: true } }),

  create: (data: Prisma.ProveedorCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).proveedor.create({ data }),

  update: (
    id: number,
    comercioId: number,
    data: Prisma.ProveedorUpdateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).proveedor.update({ where: { id, comercioId }, data }),

  // Soft delete: no se borra la fila, se marca inactiva.
  delete: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).proveedor.update({
      where: { id, comercioId },
      data: { activo: false },
    }),
};