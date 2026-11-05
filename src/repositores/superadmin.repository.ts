import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export const superadminRepository = {
  findByEmail: (email: string) =>
    prisma.superadmin.findUnique({ where: { email } }),

  findById: (id: number) =>
    prisma.superadmin.findUnique({ where: { id } }),

  create: (data: Prisma.SuperadminCreateInput) =>
    prisma.superadmin.create({ data }),
};
