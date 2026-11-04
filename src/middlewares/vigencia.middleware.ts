import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { comercioRepository } from "../repositores/comercio.repository";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { estadoSuscripcion } from "../utils/suscripcion";

const JWT_SECRET = process.env.JWT_SECRET as string;
const TTL_POR_DEFECTO_SEGUNDOS = 15;

// Estas rutas nunca se bloquean por vencimiento: un comercio vencido debe poder
// entrar, renovar su sesión y salir.
const RUTAS_EXENTAS_DE_VENCIMIENTO = new Set([
  "/usuarios/login",
  "/usuarios/refresh",
  "/usuarios/logout",
  "/usuarios/cambiar-password",
]);

const METODOS_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

interface VigenciaCacheEntry {
  activo: boolean;
  accesoHasta: Date | null;
  expiraEn: number;
}

// Solo se cachea lo mínimo necesario para calcular el estado en cada request.
const cache = new Map<number, VigenciaCacheEntry>();

const ttlSegundos = (): number => {
  const crudo = process.env.VIGENCIA_CACHE_SEGUNDOS;
  if (crudo === undefined || crudo.trim() === "") {
    return TTL_POR_DEFECTO_SEGUNDOS;
  }

  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor < 0) {
    return TTL_POR_DEFECTO_SEGUNDOS;
  }

  return valor;
};

export const invalidarVigencia = (comercioId: number): void => {
  cache.delete(comercioId);
};

const rutaSinQuery = (originalUrl: string): string => {
  const sinQuery = originalUrl.split("?")[0] ?? "";
  const normalizada = sinQuery.replace(/\/+$/, "");
  return normalizada || "/";
};

const obtenerComercioParaVigencia = async (comercioId: number) => {
  const ttl = ttlSegundos();
  const ahora = Date.now();

  if (ttl > 0) {
    const entrada = cache.get(comercioId);
    if (entrada && entrada.expiraEn > ahora) {
      return { activo: entrada.activo, accesoHasta: entrada.accesoHasta };
    }
  }

  const comercio = await comercioRepository.findById(comercioId);
  if (!comercio) {
    cache.delete(comercioId);
    return null;
  }

  const estado = { activo: comercio.activo, accesoHasta: comercio.accesoHasta };
  if (ttl > 0) {
    cache.set(comercioId, {
      ...estado,
      expiraEn: ahora + ttl * 1000,
    });
  }

  return estado;
};

// Middleware de cumplimiento de la vigencia. Si el token falta o es inválido no
// responde: deja que verificarToken del router mantenga el 401 de siempre.
export const verificarVigencia = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return next();
  }

  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return next();
  }

  if (typeof payload !== "object" || payload === null) {
    return next();
  }

  const { comercioId } = payload as { comercioId?: unknown };
  if (
    typeof comercioId !== "number" ||
    !Number.isInteger(comercioId) ||
    comercioId <= 0
  ) {
    return next();
  }

  const comercio = await obtenerComercioParaVigencia(comercioId);
  if (!comercio) {
    throw new UnauthorizedError("Token inválido o expirado");
  }

  const { estado } = estadoSuscripcion(comercio, new Date());

  if (estado === "SUSPENDIDO") {
    throw new UnauthorizedError(
      "La cuenta está suspendida. Contactá a soporte."
    );
  }

  if (estado === "VENCIDA") {
    const esLectura = METODOS_LECTURA.has(req.method.toUpperCase());
    const esExenta = RUTAS_EXENTAS_DE_VENCIMIENTO.has(
      rutaSinQuery(req.originalUrl)
    );

    if (!esLectura && !esExenta) {
      throw new ForbiddenError(
        "Tu suscripción venció: el sistema está en modo solo lectura. Contactá a soporte para renovarla."
      );
    }
  }

  next();
};
