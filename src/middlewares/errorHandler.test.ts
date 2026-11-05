import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "../generated/prisma/client";
import { errorHandler } from "./errorHandler";
import { AppError } from "../utils/errors";

const errorPrisma = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "test" });

const resFalso = () => {
  const res = {} as any;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const req = {} as any;
const next = vi.fn();

describe("errorHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("usa el statusCode y el mensaje de AppError", () => {
    const res = resFalso();

    errorHandler(new AppError("Fallo controlado", 418), req, res, next);

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      mensaje: "Fallo controlado",
    });
  });

  it("P2002 responde 409", () => {
    const res = resFalso();

    errorHandler(errorPrisma("P2002"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      mensaje: "Ya existe un registro con ese valor único",
    });
  });

  it("P2025 responde 404", () => {
    const res = resFalso();

    errorHandler(errorPrisma("P2025"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      mensaje: "Registro no encontrado",
    });
  });

  it("P2003 responde 409 con el mensaje de registros asociados", () => {
    const res = resFalso();

    errorHandler(errorPrisma("P2003"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      mensaje: "No se puede completar la operación: hay registros asociados",
    });
  });

  it("un Error común responde 500 sin filtrar detalles", () => {
    const res = resFalso();
    vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(new Error("detalle interno sensible"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      mensaje: "Error interno del servidor",
    });
  });
});
