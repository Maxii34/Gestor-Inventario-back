import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
  usuario?: { id: number; rol: string; comercioId: number };
}

export const verificarToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Token no proporcionado");
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; rol: string; comercioId: number };
    // Tokens legacy sin comercio no pueden operar: fail-closed.
    if (typeof payload.comercioId !== "number") {
      throw new UnauthorizedError("Token inválido o expirado");
    }
    req.usuario = payload;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("Token inválido o expirado");
  }
};

export const esAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.usuario?.rol !== "ADMIN") {
    throw new ForbiddenError("Acceso restringido a administradores");
  }
  next();
};

// Devuelve el comercio del usuario autenticado. Todo controller lo usa en vez
// de leer comercioId del body/query/params (R-TEN-02).
export const requireComercio = (req: AuthRequest): number => {
  const comercioId = req.usuario?.comercioId;
  if (typeof comercioId !== "number") {
    throw new UnauthorizedError("Token inválido o expirado");
  }
  return comercioId;
};
