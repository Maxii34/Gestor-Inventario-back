import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const clienteRepository = {
  // El identificador descendente mantiene la paginación estable y muestra primero los más recientes.
  findAll: (comercioId: number, skip?: number, take?: number) =>
    prisma.cliente.findMany({
      where: { comercioId, activo: true },
      skip,
      take,
      orderBy: { id: "desc" },
    }),

  // Cuenta el total de clientes activos, sin traer los datos.
  // Lo necesitamos para calcular cuántas páginas hay en total.
  count: (comercioId: number) => prisma.cliente.count({ where: { comercioId, activo: true } }),

  findById: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.findFirst({
      where: { id, comercioId },
      include: { ventas: true },
    }),

  create: (data: Prisma.ClienteCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.create({ data }),

  update: (id: number, comercioId: number, data: Prisma.ClienteUpdateInput) =>
    prisma.cliente.update({ where: { id, comercioId }, data }),

  delete: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).cliente.update({ where: { id, comercioId }, data: { activo: false } }),
};
