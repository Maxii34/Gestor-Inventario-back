import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
  usuario?: { id: number; rol: string };
}

export const verificarToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, mensaje: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: number; rol: string };
    req.usuario = payload;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, mensaje: "Token inválido o expirado" });
  }
};

export const esAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.usuario?.rol !== "ADMIN") {
    return res.status(403).json({ ok: false, mensaje: "Acceso restringido a administradores" });
  }
  next();
};