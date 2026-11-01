import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { superadminRepository } from "../repositores/superadmin.repository";
import { UnauthorizedError } from "../utils/errors";
import { obtenerSecretoPlataforma } from "../utils/plataformaJwt";

export interface PlataformaRequest extends Request {
  superadmin?: { id: number };
}

export const verificarSuperadmin = async (
  req: PlataformaRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Token no proporcionado");
  }

  const token = authHeader.slice("Bearer ".length);
  const secreto = obtenerSecretoPlataforma();

  let payload: unknown;
  try {
    payload = jwt.verify(token, secreto);
  } catch {
    throw new UnauthorizedError("Token inválido o expirado");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new UnauthorizedError("Token inválido o expirado");
  }

  const { sub, tipo } = payload as { sub?: unknown; tipo?: unknown };
  const id =
    typeof sub === "string" && /^\d+$/.test(sub) ? Number(sub) : sub;

  if (
    tipo !== "plataforma" ||
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new UnauthorizedError("Token inválido o expirado");
  }

  const superadmin = await superadminRepository.findById(id);
  if (!superadmin || !superadmin.activo) {
    throw new UnauthorizedError("Token inválido o expirado");
  }

  req.superadmin = { id };
  next();
};

export const requireSuperadmin = (req: PlataformaRequest): number => {
  const id = req.superadmin?.id;
  if (id === undefined || !Number.isInteger(id) || id <= 0) {
    throw new UnauthorizedError("Token inválido o expirado");
  }
  return id;
};
