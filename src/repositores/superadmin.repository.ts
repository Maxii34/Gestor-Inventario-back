import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export const superadminRepository = {
  findByEmail: (email: string) =>
    prisma.superadmin.findUnique({ where: { email } }),

  create: (data: Prisma.SuperadminCreateInput) =>
    prisma.superadmin.create({ data }),
};
