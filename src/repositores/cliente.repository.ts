import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const clienteRepository = {
  // Ahora recibe skip/take para traer solo una "porción" de los registros.
  // Son opcionales para no romper otros lugares que todavía llamen a findAll()
  // sin paginar (por las dudas, aunque hoy no debería quedar ningún caso así).
  findAll: (skip?: number, take?: number) =>
    prisma.cliente.findMany({
      where: { activo: true },
      skip,
      take,
      orderBy: { id: "asc" }, // importante: sin un orden fijo, la paginación puede traer resultados inconsistentes entre páginas
    }),

  // Cuenta el total de clientes activos, sin traer los datos.
  // Lo necesitamos para calcular cuántas páginas hay en total.
  count: () => prisma.cliente.count({ where: { activo: true } }),

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