import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

export const refreshTokenRepository = {
  create: (usuarioId: number, token: string, expiraEn: Date) =>
    prisma.refreshToken.create({ data: { usuarioId, token, expiraEn } }),

  findByToken: (token: string) =>
    prisma.refreshToken.findUnique({ where: { token } }),

  revocar: (id: number, usuarioId: number) =>
    prisma.refreshToken.updateMany({
      where: { id, usuarioId },
      data: { revocado: true },
    }),

  revocarTodosDeUsuario: (usuarioId: number, tx?: PrismaTx) =>
    (tx ?? prisma).refreshToken.updateMany({
      where: { usuarioId, revocado: false },
      data: { revocado: true },
    }),
};