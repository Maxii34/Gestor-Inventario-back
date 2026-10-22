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

export const usuarioRepository = {
  findAll: (comercioId: number) =>
    prisma.usuario.findMany({
      where: { comercioId },
      select: seleccionSinPassword,
      orderBy: { id: 'asc' },
    }),

  findById: (id: number, comercioId: number) =>
    prisma.usuario.findFirst({
      where: { id, comercioId },
      select: seleccionSinPassword,
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
