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
  fechaBaja: null,
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

  findByRol: (comercioId: number, rol: RolUsuario, tx?: PrismaTx) =>
    (tx ?? prisma).usuario.findMany({
      where: { comercioId, rol, activo: true },
      select: seleccionSinPassword,
    }),

  // Todos los usuarios del comercio (activos e inactivos) para resúmenes que
  // deben incluir también a quienes no registraron ventas. Las bajas solo se
  // conservan si tienen ventas, para no ensuciar la estadística por vendedor.
  findResumenPorComercio: (comercioId: number) =>
    prisma.usuario.findMany({
      where: {
        comercioId,
        OR: [
          { fechaBaja: null },
          { ventasRealizadas: { some: {} } },
          { ventasAnuladas: { some: {} } },
        ],
      },
      select: { id: true, nombre: true, rol: true, activo: true },
      orderBy: { id: "asc" },
    }),

  // Lectura para eliminar: incluye el historial que impide el borrado físico.
  findByIdParaEliminar: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).usuario.findFirst({
      where: { id, comercioId },
      select: {
        id: true,
        rol: true,
        activo: true,
        _count: {
          select: {
            ventasRealizadas: true,
            ventasAnuladas: true,
            movimientosGenerados: true,
          },
        },
      },
    }),

  create: (data: Prisma.UsuarioCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).usuario.create({ data }),

  update: (
    id: number,
    comercioId: number,
    data: Prisma.UsuarioUpdateInput,
    tx?: PrismaTx
  ) => (tx ?? prisma).usuario.update({ where: { id, comercioId }, data }),

  darDeBaja: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).usuario.update({
      where: { id, comercioId },
      data: {
        activo: false,
        fechaBaja: new Date(),
        email: `baja-${id}@stocknext.invalid`,
      },
    }),

  delete: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).usuario.delete({ where: { id, comercioId } }),
};
