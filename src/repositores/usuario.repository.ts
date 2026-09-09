import { prisma } from "../config/prisma";
import { Prisma, RolUsuario } from "../generated/prisma/client";

export const usuarioRepository = {
  findAll: () =>
    prisma.usuario.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, fechaCreacion: true },
    }),

  findById: (id: number) =>
    prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, fechaCreacion: true },
    }),

  findByEmail: (email: string) =>
    prisma.usuario.findUnique({ where: { email } }),

findByRol: (rol: RolUsuario) =>
    prisma.usuario.findMany({
      where: { rol, activo: true },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, fechaCreacion: true },
    }),

  create: (data: Prisma.UsuarioCreateInput) =>
    prisma.usuario.create({ data }),

  update: (id: number, data: Prisma.UsuarioUpdateInput) =>
    prisma.usuario.update({ where: { id }, data }),

  delete: (id: number) =>
    prisma.usuario.update({ where: { id }, data: { activo: false } }),
};