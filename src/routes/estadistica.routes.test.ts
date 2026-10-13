import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { verificarToken } from "../middlewares/auth.middleware";
import { UnauthorizedError } from "../utils/errors";
import estadisticaRouter from "./estadistica.routes";

vi.mock("jsonwebtoken");

const next = () => {};

describe("estadistica.routes: GET /recaudacion protegida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra verificarToken antes del controller en GET /recaudacion", () => {
    const capa = (estadisticaRouter.stack as any[]).find(
      (l) => l.route?.path === "/recaudacion" && l.route?.methods?.get
    );
    expect(capa).toBeDefined();
    const handlers = capa.route.stack.map((s: any) => s.handle);
    expect(handlers).toContain(verificarToken);
    // El middleware debe correr antes que el controller (último handler)
    expect(handlers.indexOf(verificarToken)).toBeLessThan(handlers.length - 1);
  });

  it("rechaza petición sin token con UnauthorizedError", () => {
    const req = { headers: {} } as any;
    const res = {} as any;
    expect(() => verificarToken(req, res, next as any)).toThrow(UnauthorizedError);
  });

  it("rechaza token inválido con UnauthorizedError", () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("invalid");
    });
    const req = { headers: { authorization: "Bearer token-invalido" } } as any;
    const res = {} as any;
    expect(() => verificarToken(req, res, next as any)).toThrow(UnauthorizedError);
  });

  it("con token válido fija req.usuario y llama next (comportamiento esperado conservado)", () => {
    vi.mocked(jwt.verify).mockReturnValue({ id: 1, rol: "ADMIN" } as any);
    const req = { headers: { authorization: "Bearer token-valido" } } as any;
    const res = {} as any;
    const nextFn = vi.fn();
    verificarToken(req, res, nextFn as any);
    expect(req.usuario).toEqual({ id: 1, rol: "ADMIN" });
    expect(nextFn).toHaveBeenCalledOnce();
  });
});
