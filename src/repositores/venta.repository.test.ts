import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    venta: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

import { prisma } from "../config/prisma";
import { construirWhereVentas, ventaRepository } from "./venta.repository";

const filtros = {
  vendedorId: 5,
  desde: "2025-01-10",
  hasta: "2025-01-20",
  estado: "COMPLETADA" as const,
  metodoPago: "EFECTIVO" as const,
};

describe("construirWhereVentas", () => {
  it("siempre incluye el comercio aunque no haya filtros", () => {
    expect(construirWhereVentas(7)).toEqual({ comercioId: 7 });
  });

  it("arma el where con todos los filtros", () => {
    expect(construirWhereVentas(7, filtros)).toEqual({
      comercioId: 7,
      vendedorId: 5,
      estado: "COMPLETADA",
      metodoPago: "EFECTIVO",
      fecha: {
        gte: new Date("2025-01-10T03:00:00.000Z"),
        lte: new Date("2025-01-21T02:59:59.999Z"),
      },
    });
  });

  it("aplica solo el límite inferior o superior cuando falta uno", () => {
    expect(construirWhereVentas(7, { desde: "2025-01-10" })).toEqual({
      comercioId: 7,
      fecha: { gte: new Date("2025-01-10T03:00:00.000Z") },
    });

    expect(construirWhereVentas(7, { hasta: "2025-01-10" })).toEqual({
      comercioId: 7,
      fecha: { lte: new Date("2025-01-11T02:59:59.999Z") },
    });
  });
});

describe("ventaRepository.findAll y count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usan exactamente el mismo where y conservan el aislamiento por comercio", async () => {
    await ventaRepository.findAll(7, 0, 10, filtros);
    await ventaRepository.count(7, filtros);

    const whereFindAll = (prisma.venta.findMany as any).mock.calls[0][0].where;
    const whereCount = (prisma.venta.count as any).mock.calls[0][0].where;

    expect(whereFindAll).toEqual(whereCount);
    expect(whereFindAll).toEqual(construirWhereVentas(7, filtros));
    expect(whereFindAll).toMatchObject({ comercioId: 7 });
  });

  it("incluye vendedor y anuladoPor solo con id, nombre y rol", async () => {
    await ventaRepository.findAll(7);

    const args = (prisma.venta.findMany as any).mock.calls[0][0];
    expect(args.include).toMatchObject({
      vendedor: { select: { id: true, nombre: true, rol: true } },
      anuladoPor: { select: { id: true, nombre: true, rol: true } },
    });
    expect(JSON.stringify(args.include)).not.toContain("email");
    expect(JSON.stringify(args.include)).not.toContain("password");
  });
});
