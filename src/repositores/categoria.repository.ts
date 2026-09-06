import { prisma } from "../config/prisma";

export const categoriaRepository = {
  findAll: () => prisma.categoria.findMany(),

  findById: (id: number) => prisma.categoria.findUnique({ where: { id } }),

  create: (data: { nombre: string; descripcion?: string }) =>
    prisma.categoria.create({ data }),

  update: (id: number, data: { nombre?: string; descripcion?: string }) =>
    prisma.categoria.update({ where: { id }, data }),

  delete: (id: number) => prisma.categoria.delete({ where: { id } }),
};
