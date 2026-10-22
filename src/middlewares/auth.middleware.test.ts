import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { verificarToken, requireComercio, AuthRequest } from "./auth.middleware";
import { UnauthorizedError } from "../utils/errors";

vi.mock("jsonwebtoken");

const ejecutarVerificarToken = (comercioId: unknown) => {
  vi.mocked(jwt.verify).mockReturnValue({ id: 1, rol: "ADMIN", comercioId } as any);
  const req = { headers: { authorization: "Bearer token" } } as any;
  const next = vi.fn();
  verificarToken(req, {} as any, next as any);
  return { req, next };
};

describe("verificarToken: validación de comercioId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([0, -1, 1.5, "1"])("rechaza comercioId inválido (%s)", (comercioId) => {
    expect(() => ejecutarVerificarToken(comercioId)).toThrow(UnauthorizedError);
  });

  it("acepta un comercioId entero positivo", () => {
    const { req, next } = ejecutarVerificarToken(1);

    expect(req.usuario).toEqual({ id: 1, rol: "ADMIN", comercioId: 1 });
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireComercio: validación de comercioId", () => {
  it.each([0, -1, 1.5])("rechaza comercioId inválido (%s)", (comercioId) => {
    const req = { usuario: { id: 1, rol: "ADMIN", comercioId } } as unknown as AuthRequest;

    expect(() => requireComercio(req)).toThrow(UnauthorizedError);
  });

  it("devuelve el comercioId entero positivo", () => {
    const req = { usuario: { id: 1, rol: "ADMIN", comercioId: 1 } } as unknown as AuthRequest;

    expect(requireComercio(req)).toBe(1);
  });
});
