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

  findComercioParaEliminar: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).comercio.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        slug: true,
        activo: true,
        plan: true,
        accesoHasta: true,
        _count: {
          select: {
            usuarios: true,
            productos: true,
            ventas: true,
            pagos: true,
          },
        },
      },
    }),

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

  revocarRefreshTokensDeUsuario: (usuarioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).refreshToken.updateMany({
      where: { usuarioId, revocado: false },
      data: { revocado: true },
    }),

  findUsuariosDeComercio: (
    comercioId: number,
    skip: number,
    take: number,
    q?: string,
    incluirBajas = false
  ) =>
    prisma.usuario.findMany({
      where: {
        comercioId,
        ...(incluirBajas ? {} : { fechaBaja: null }),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      skip,
      take,
      orderBy: { id: "asc" },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        fechaBaja: true,
        debeCambiarPassword: true,
        fechaCreacion: true,
      },
    }),

  countUsuariosDeComercio: (
    comercioId: number,
    q?: string,
    incluirBajas = false
  ) =>
    prisma.usuario.count({
      where: {
        comercioId,
        ...(incluirBajas ? {} : { fechaBaja: null }),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    }),

  findUsuarioDeComercio: (
    comercioId: number,
    usuarioId: number,
    tx?: PrismaTx
  ) =>
    (tx ?? prisma).usuario.findFirst({
      where: { id: usuarioId, comercioId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        fechaBaja: true,
        debeCambiarPassword: true,
        fechaCreacion: true,
      },
    }),

  findUsuarioPorEmail: (
    comercioId: number,
    email: string,
    tx?: PrismaTx
  ) =>
    (tx ?? prisma).usuario.findUnique({
      where: { comercioId_email: { comercioId, email } },
      select: { id: true },
    }),

  findUsuariosActivosPorRol: (
    comercioId: number,
    rol: "ADMIN" | "VENDEDOR",
    tx?: PrismaTx
  ) =>
    (tx ?? prisma).usuario.findMany({
      where: { comercioId, rol, activo: true },
      select: { id: true },
    }),

  updateUsuario: (
    usuarioId: number,
    comercioId: number,
    data: Prisma.UsuarioUncheckedUpdateInput,
    tx?: PrismaTx
  ) =>
    (tx ?? prisma).usuario.update({
      where: { id: usuarioId, comercioId },
      data,
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        fechaBaja: true,
        debeCambiarPassword: true,
        fechaCreacion: true,
      },
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
