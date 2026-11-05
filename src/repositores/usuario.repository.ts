import { prisma } from "../config/prisma";
import { Prisma, RolUsuario } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

const seleccionSinPassword = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  comercioId: true,
  fechaCreacion: true,
} as const;

const construirWhere = (
  comercioId: number,
  q?: string
): Prisma.UsuarioWhereInput => ({
  comercioId,
  ...(q
    ? {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {}),
});

export const usuarioRepository = {
  findAll: (comercioId: number, skip: number, take: number, q?: string) =>
    prisma.usuario.findMany({
      where: construirWhere(comercioId, q),
      skip,
      take,
      select: seleccionSinPassword,
      orderBy: { id: 'desc' },
    }),

  count: (comercioId: number, q?: string) =>
    prisma.usuario.count({ where: construirWhere(comercioId, q) }),

  findById: (id: number, comercioId: number) =>
    prisma.usuario.findFirst({
      where: { id, comercioId },
      select: seleccionSinPassword,
    }),

  findByIdConPassword: (id: number, comercioId: number) =>
    prisma.usuario.findFirst({
      where: { id, comercioId },
      select: {
        id: true,
        password: true,
        rol: true,
        activo: true,
        comercioId: true,
        debeCambiarPassword: true,
      },
    }),

  // Solo para `refresh`: el token ya identifica al usuario y de acá se
  // re-deriva su comercio (nunca viaja en el pedido). No usar para lecturas
  // expuestas: esas siempre llevan comercioId explícito.
  findByIdParaRefresh: (id: number) =>
    prisma.usuario.findUnique({
      where: { id },
      select: { id: true, rol: true, comercioId: true, activo: true },
    }),

  // El email solo es único dentro de cada comercio (@@unique([comercioId, email])):
  // la búsqueda siempre exige el comercio, nunca es global.
  findByEmailAndComercio: (comercioId: number, email: string) =>
    prisma.usuario.findUnique({ where: { comercioId_email: { comercioId, email } } }),

  findByRol: (comercioId: number, rol: RolUsuario) =>
    prisma.usuario.findMany({
      where: { comercioId, rol, activo: true },
      select: seleccionSinPassword,
    }),

  create: (data: Prisma.UsuarioCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).usuario.create({ data }),

  update: (id: number, comercioId: number, data: Prisma.UsuarioUpdateInput) =>
    prisma.usuario.update({ where: { id, comercioId }, data }),

  delete: (id: number, comercioId: number) =>
    prisma.usuario.update({ where: { id, comercioId }, data: { activo: false } }),
};
