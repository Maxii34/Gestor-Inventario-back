import { prisma } from "../config/prisma";

export const refreshTokenRepository = {
  create: (usuarioId: number, token: string, expiraEn: Date) =>
    prisma.refreshToken.create({ data: { usuarioId, token, expiraEn } }),

  findByToken: (token: string) =>
    prisma.refreshToken.findUnique({ where: { token } }),

  revocar: (id: number) =>
    prisma.refreshToken.update({ where: { id }, data: { revocado: true } }),

  revocarTodosDeUsuario: (usuarioId: number) =>
    prisma.refreshToken.updateMany({
      where: { usuarioId, revocado: false },
      data: { revocado: true },
    }),
};