import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const comercioRepository = {
  findById: (id: number, tx?: PrismaTx) =>
    (tx ?? prisma).comercio.findUnique({ where: { id } }),

  findBySlug: (slug: string, tx?: PrismaTx) =>
    (tx ?? prisma).comercio.findUnique({ where: { slug } }),

  create: (data: Prisma.ComercioCreateInput, tx?: PrismaTx) =>
    (tx ?? prisma).comercio.create({ data }),
};
