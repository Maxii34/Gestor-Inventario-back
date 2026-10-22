import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const clienteRepository = {
  // Ahora recibe skip/take para traer solo una "porción" de los registros.
  // Son opcionales para no romper otros lugares que todavía llamen a findAll()
  // sin paginar (por las dudas, aunque hoy no debería quedar ningún caso así).
  findAll: (comercioId: number, skip?: number, take?: number) =>
    prisma.cliente.findMany({
      where: { comercioId, activo: true },
      skip,
      take,
      orderBy: { id: "asc" }, // importante: sin un orden fijo, la paginación puede traer resultados inconsistentes entre páginas
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
