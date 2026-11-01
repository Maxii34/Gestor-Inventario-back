import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

const conteos = {
  _count: { select: { usuarios: true, productos: true, ventas: true } },
} as const;

export const plataformaRepository = {
  findComercios: (
    where: Prisma.ComercioWhereInput,
    skip: number,
    take: number
  ) =>
    prisma.comercio.findMany({
      where,
      skip,
      take,
      orderBy: { id: "asc" },
      include: conteos,
    }),

  findComerciosTodos: (where: Prisma.ComercioWhereInput) =>
    prisma.comercio.findMany({
      where,
      orderBy: { id: "asc" },
      include: conteos,
    }),

  countComercios: (where: Prisma.ComercioWhereInput) =>
    prisma.comercio.count({ where }),

  findComercioDetalle: (id: number) =>
    prisma.comercio.findUnique({
      where: { id },
      include: {
        ...conteos,
        pagos: { orderBy: { fecha: "desc" }, take: 10 },
        auditorias: { orderBy: { fecha: "desc" }, take: 10 },
      },
    }),

  findComercioById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).comercio.findUnique({ where: { id } }),

  updateComercio: (
    id: number,
    data: Prisma.ComercioUncheckedUpdateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).comercio.update({ where: { id }, data }),

  updateComercioCondicional: (
    where: Prisma.ComercioWhereInput,
    data: Prisma.ComercioUncheckedUpdateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).comercio.updateMany({ where, data }),

  revocarRefreshTokensDeComercio: (comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).refreshToken.updateMany({
      where: { revocado: false, usuario: { comercioId } },
      data: { revocado: true },
    }),

  crearPago: (data: Prisma.PagoUncheckedCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).pago.create({ data }),

  findPagos: (comercioId: number, skip: number, take: number) =>
    prisma.pago.findMany({
      where: { comercioId },
      orderBy: { fecha: "desc" },
      skip,
      take,
    }),

  countPagos: (comercioId: number) =>
    prisma.pago.count({ where: { comercioId } }),

  crearAuditoria: (
    data: Prisma.AuditoriaPlataformaUncheckedCreateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).auditoriaPlataforma.create({ data }),

  findAuditorias: (
    where: Prisma.AuditoriaPlataformaWhereInput,
    skip: number,
    take: number
  ) =>
    prisma.auditoriaPlataforma.findMany({
      where,
      orderBy: { fecha: "desc" },
      skip,
      take,
    }),

  countAuditorias: (where: Prisma.AuditoriaPlataformaWhereInput) =>
    prisma.auditoriaPlataforma.count({ where }),

  findComerciosParaMetricas: () =>
    prisma.comercio.findMany({
      select: {
        id: true,
        activo: true,
        accesoHasta: true,
        plan: true,
        ultimoLogin: true,
      },
    }),

  sumarPagosPorMoneda: (desde: Date, hasta: Date) =>
    prisma.pago.groupBy({
      by: ["moneda"],
      where: { fecha: { gte: desde, lt: hasta } },
      _sum: { monto: true },
    }),
};
