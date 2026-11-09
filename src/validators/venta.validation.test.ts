import { describe, it, expect } from "vitest";
import { rangoFechasQuerySchema, ventasQuerySchema } from "./venta.validation";

describe("ventasQuerySchema", () => {
  it("acepta y normaliza filtros válidos, ignorando parámetros desconocidos", () => {
    const resultado = ventasQuerySchema.safeParse({
      vendedorId: "5",
      desde: "2025-01-01",
      hasta: "2025-12-31",
      estado: "COMPLETADA",
      metodoPago: "EFECTIVO",
      desconocido: "se ignora",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;

    expect(resultado.data).toEqual({
      vendedorId: 5,
      desde: "2025-01-01",
      hasta: "2025-12-31",
      estado: "COMPLETADA",
      metodoPago: "EFECTIVO",
    });
  });

  it("acepta una query vacía", () => {
    expect(ventasQuerySchema.safeParse({}).success).toBe(true);
  });

  it.each(["0", "-1", "1.5", "abc"])(
    "rechaza vendedorId inválido: %s",
    (vendedorId) => {
      expect(ventasQuerySchema.safeParse({ vendedorId }).success).toBe(false);
    }
  );

  it.each([
    "2025-02-31",
    "2025-02-29",
    "2025-13-01",
    "2025-1-1",
    "31/02/2025",
  ])("rechaza fechas inexistentes o mal formadas: %s", (desde) => {
    expect(ventasQuerySchema.safeParse({ desde }).success).toBe(false);
  });

  it("rechaza desde posterior a hasta", () => {
    const resultado = ventasQuerySchema.safeParse({
      desde: "2025-02-01",
      hasta: "2025-01-31",
    });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un rango de más de 366 días", () => {
    const resultado = ventasQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2025-01-02",
    });

    expect(resultado.success).toBe(false);
  });

  it("acepta un rango de exactamente 366 días", () => {
    const resultado = ventasQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2025-01-01",
    });

    expect(resultado.success).toBe(true);
  });

  it.each(["OTRO", "COMPLETADAS", ""])("rechaza estado inválido: %s", (estado) => {
    expect(ventasQuerySchema.safeParse({ estado }).success).toBe(false);
  });

  it.each(["OTRO", "CHEQUE", ""])("rechaza metodoPago inválido: %s", (metodoPago) => {
    expect(ventasQuerySchema.safeParse({ metodoPago }).success).toBe(false);
  });
});

describe("rangoFechasQuerySchema", () => {
  it("acepta desde y hasta por separado u omitidos", () => {
    expect(rangoFechasQuerySchema.safeParse({}).success).toBe(true);
    expect(rangoFechasQuerySchema.safeParse({ desde: "2025-01-01" }).success).toBe(true);
    expect(rangoFechasQuerySchema.safeParse({ hasta: "2025-01-31" }).success).toBe(true);
  });

  it("aplica las mismas reglas de rango", () => {
    expect(
      rangoFechasQuerySchema.safeParse({
        desde: "2025-02-01",
        hasta: "2025-01-31",
      }).success
    ).toBe(false);

    expect(
      rangoFechasQuerySchema.safeParse({
        desde: "2024-01-01",
        hasta: "2025-01-02",
      }).success
    ).toBe(false);

    expect(rangoFechasQuerySchema.safeParse({ desde: "2025-02-31" }).success).toBe(false);
  });
});
