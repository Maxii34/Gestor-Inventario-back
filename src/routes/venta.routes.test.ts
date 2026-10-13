import { describe, it, expect, vi } from "vitest";
import { esAdmin, verificarToken } from "../middlewares/auth.middleware";
import { verificarFirmaMercadoPago } from "../middlewares/mercadopagoWebhook";
import { ForbiddenError } from "../utils/errors";
import ventaRouter from "./venta.routes";

const handlersDe = (path: string, metodo: "get" | "post" | "put" | "delete") => {
  const capa = (ventaRouter.stack as any[]).find(
    (l) => l.route?.path === path && l.route?.methods?.[metodo]
  );
  if (!capa) throw new Error(`ruta no encontrada: ${metodo.toUpperCase()} ${path}`);
  return capa.route.stack.map((s: any) => s.handle) as Function[];
};

describe("venta.routes: protección de operaciones administrativas", () => {
  it("PUT /:id exige rol ADMIN", () => {
    expect(handlersDe("/:id", "put")).toContain(esAdmin);
  });

  it("DELETE /:id exige rol ADMIN (el servicio además prohíbe el borrado con 409)", () => {
    expect(handlersDe("/:id", "delete")).toContain(esAdmin);
  });

  it("POST /:id/anular existe y exige rol ADMIN", () => {
    const handlers = handlersDe("/:id/anular", "post");
    expect(handlers).toContain(verificarToken);
    expect(handlers).toContain(esAdmin);
    expect(handlers.indexOf(esAdmin)).toBeLessThan(handlers.length - 1);
  });

  it("POST /webhook conserva la validación de firma (compatibilidad MP)", () => {
    const handlers = handlersDe("/webhook", "post");
    expect(handlers).toContain(verificarFirmaMercadoPago);
    expect(handlers).not.toContain(verificarToken);
  });

  it("esAdmin rechaza a VENDEDOR con 403", () => {
    const req = { usuario: { id: 1, rol: "VENDEDOR" } } as any;
    const next = vi.fn();
    expect(() => esAdmin(req, {} as any, next as any)).toThrow(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
  });

  it("esAdmin deja pasar a ADMIN", () => {
    const req = { usuario: { id: 1, rol: "ADMIN" } } as any;
    const next = vi.fn();
    esAdmin(req, {} as any, next as any);
    expect(next).toHaveBeenCalledOnce();
  });
});
