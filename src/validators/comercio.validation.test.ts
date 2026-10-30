import { describe, it, expect } from "vitest";
import { registrarComercioSchema } from "./comercio.validation";

const base = {
  nombre: "Kiosco",
  adminNombre: "Admin",
  adminEmail: "admin@test.com",
};

const conPassword = (adminPassword: string) => ({
  ...base,
  adminPassword,
});

describe("registrarComercioSchema - adminPassword", () => {
  it("acepta una contraseña normal", () => {
    expect(registrarComercioSchema.safeParse(conPassword("123456")).success).toBe(
      true
    );
  });

  it("rechaza una contraseña de 5 caracteres", () => {
    expect(registrarComercioSchema.safeParse(conPassword("12345")).success).toBe(
      false
    );
  });

  it("acepta 72 bytes y rechaza 73", () => {
    expect(
      registrarComercioSchema.safeParse(conPassword("a".repeat(72))).success
    ).toBe(true);
    expect(
      registrarComercioSchema.safeParse(conPassword("a".repeat(73))).success
    ).toBe(false);
  });

  it("mide bytes, no caracteres (ñ = 2 bytes en UTF-8)", () => {
    expect(
      registrarComercioSchema.safeParse(conPassword("ñ".repeat(36))).success
    ).toBe(true); // 72 bytes
    expect(
      registrarComercioSchema.safeParse(conPassword("ñ".repeat(37))).success
    ).toBe(false); // 74 bytes
  });

  it("sigue rechazando un campo extra (schema estricto)", () => {
    expect(
      registrarComercioSchema.safeParse({
        ...conPassword("123456"),
        comercioId: 1,
      }).success
    ).toBe(false);
  });
});
