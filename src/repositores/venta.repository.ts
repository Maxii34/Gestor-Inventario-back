import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const ventaRepository = {
  findAll: (comercioId: number, skip?: number, take?: number) =>
    prisma.venta.findMany({
      where: { comercioId },
      skip,
      take,
      orderBy: { fecha: "desc" },
      include: { detalles: true, cliente: true },
    }),

  count: (comercioId: number) => prisma.venta.count({ where: { comercioId } }),

  findById: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findFirst({
      where: { id, comercioId },
      include: { detalles: { include: { producto: true } }, cliente: true },
    }),

  // Solo para el webhook de MP: la notificación no trae comercio del
  // solicitante (la autentica la firma HMAC) y el external_reference es el id
  // global de la venta. El servicio sigue operando con venta.comercioId.
  findByIdGlobal: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findUnique({
      where: { id },
      include: { detalles: { include: { producto: true } }, cliente: true },
    }),

  // Nuevo: el webhook de Mercado Pago no conoce el id interno de la venta,
  // solo el external_reference que le mandamos al crear la preferencia.
  // Este método la busca por ese dato.
  findByPreferenceId: (preferenceId: string, tx?: PrismaTx) =>
    (tx ?? prisma).venta.findFirst({
      where: { mercadoPagoPreferenceId: preferenceId },
      include: { detalles: { include: { producto: true } } },
    }),

  create: (data: Prisma.VentaCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.create({ data, include: { detalles: true } }),

  update: (id: number, comercioId: number, data: Prisma.VentaUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.update({ where: { id, comercioId }, data }),

  // Actualización condicional por estado: se usa para reclamar transiciones
  // (ej: anular) de forma atómica y evitar dobles operaciones concurrentes.
  updateMany: (where: Prisma.VentaWhereInput, data: Prisma.VentaUpdateInput, tx?: PrismaTx) =>
    (tx ?? prisma).venta.updateMany({ where, data }),

  delete: (id: number, comercioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).venta.delete({ where: { id, comercioId } }),

  //suma el total de ventas COMPLETADA dentro de un rango de fechas.
  sumarRecaudacion: (comercioId: number, desde: Date, hasta: Date) =>
    prisma.venta.aggregate({
      where: {
        comercioId,
        estado: "COMPLETADA",
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { total: true },
    }),
};
