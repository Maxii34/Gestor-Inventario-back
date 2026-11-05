import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { crearSuperadmin } from "./superadmin.service";
import { superadminRepository } from "../repositores/superadmin.repository";
import { BadRequestError, ConflictError } from "../utils/errors";

vi.mock("../repositores/superadmin.repository");
vi.mock("bcrypt");

const superadminCreado = {
  id: 7,
  nombre: "Dueño",
  email: "dueno@x.com",
  password: "hash",
  activo: true,
  fechaCreacion: new Date("2025-11-01T12:00:00.000Z"),
  fechaActualizacion: new Date("2025-11-01T12:00:00.000Z"),
};

describe("crearSuperadmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza un email duplicado con ConflictError", async () => {
    vi.mocked(superadminRepository.findByEmail).mockResolvedValue(
      superadminCreado as never
    );

    await expect(
      crearSuperadmin({
        nombre: "Dueño",
        email: "dueno@x.com",
        password: "secreta123",
      })
    ).rejects.toThrow(ConflictError);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(superadminRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas de menos de 6 bytes", async () => {
    await expect(
      crearSuperadmin({
        nombre: "Dueño",
        email: "dueno@x.com",
        password: "12345",
      })
    ).rejects.toThrow(BadRequestError);

    expect(superadminRepository.findByEmail).not.toHaveBeenCalled();
    expect(superadminRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas de más de 72 bytes (multibyte)", async () => {
    const password = "á".repeat(37); // 74 bytes en UTF-8

    await expect(
      crearSuperadmin({
        nombre: "Dueño",
        email: "dueno@x.com",
        password,
      })
    ).rejects.toThrow(BadRequestError);

    expect(superadminRepository.findByEmail).not.toHaveBeenCalled();
    expect(superadminRepository.create).not.toHaveBeenCalled();
  });

  it("normaliza el email, hashea la contraseña y no devuelve el password", async () => {
    vi.mocked(superadminRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hash" as never);
    vi.mocked(superadminRepository.create).mockResolvedValue(
      superadminCreado as never
    );

    const resultado = await crearSuperadmin({
      nombre: "Dueño",
      email: "  Dueno@X.com  ",
      password: "secreta123",
    });

    expect(superadminRepository.findByEmail).toHaveBeenCalledWith(
      "dueno@x.com"
    );
    expect(bcrypt.hash).toHaveBeenCalledWith("secreta123", 10);
    expect(superadminRepository.create).toHaveBeenCalledWith({
      nombre: "Dueño",
      email: "dueno@x.com",
      password: "hash",
    });
    expect(resultado).not.toHaveProperty("password");
    expect(resultado).toEqual({
      id: 7,
      nombre: "Dueño",
      email: "dueno@x.com",
      activo: true,
      fechaCreacion: superadminCreado.fechaCreacion,
      fechaActualizacion: superadminCreado.fechaActualizacion,
    });
  });
});
