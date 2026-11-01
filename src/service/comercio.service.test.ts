import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcrypt";
import { comercioService } from "./comercio.service";
import { comercioRepository } from "../repositores/comercio.repository";
import { usuarioRepository } from "../repositores/usuario.repository";
import { prisma } from "../config/prisma";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors";
import { calcularNuevoAcceso, DIAS_PRUEBA } from "../utils/suscripcion";

vi.mock("../repositores/comercio.repository");
vi.mock("../repositores/usuario.repository");
vi.mock("bcrypt");
vi.mock("../config/prisma", () => ({
  // La registración es transaccional: el mock ejecuta el callback con un tx falso.
  prisma: { $transaction: vi.fn((callback) => callback({})) },
}));

describe("comercioService.registrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea el comercio y su ADMIN en una transacción y no devuelve el password", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hash" as never);
    vi.mocked(comercioRepository.create).mockResolvedValue({ id: 5, slug: "kiosco-don-pepe" } as any);
    vi.mocked(usuarioRepository.create).mockResolvedValue({
      id: 1, nombre: "Dueño", email: "a@a.com", password: "hash", rol: "ADMIN",
    } as any);

    const resultado = await comercioService.registrar({
      nombre: "Kiosco Don Pepe",
      adminNombre: "Dueño",
      adminEmail: "A@A.com",
      adminPassword: "secreta123",
    });

    // Slug generado del nombre y email normalizado
    expect(comercioRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "kiosco-don-pepe" }),
      expect.anything()
    );
    expect(usuarioRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "a@a.com",
        rol: "ADMIN",
        comercio: { connect: { id: 5 } },
      }),
      expect.anything()
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(resultado.administrador).not.toHaveProperty("password");
    expect(resultado.comercio).toEqual({ id: 5, slug: "kiosco-don-pepe" });
  });

  it("respeta un slug explícito válido y rechaza el duplicado con 409", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue({ id: 1, slug: "kiosco" } as any);

    await expect(
      comercioService.registrar({
        nombre: "Otro",
        slug: "kiosco",
        adminNombre: "X",
        adminEmail: "x@x.com",
        adminPassword: "secreta123",
      })
    ).rejects.toThrow(ConflictError);
    expect(usuarioRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza slug que no deja identificador válido con 400", async () => {
    await expect(
      comercioService.registrar({
        nombre: "!!!",
        adminNombre: "X",
        adminEmail: "x@x.com",
        adminPassword: "secreta123",
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("lanza NotFoundError si el comercio no existe o está inactivo", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(null);
    await expect(comercioService.getBySlug("fantasma")).rejects.toThrow(NotFoundError);

    vi.mocked(comercioRepository.findBySlug).mockResolvedValue({ id: 1, activo: false } as any);
    await expect(comercioService.getBySlug("dado-de-baja")).rejects.toThrow(NotFoundError);
  });

  it("el registro público nace en PRUEBA con accesoHasta a DIAS_PRUEBA", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-11-10T15:00:00.000Z"));

    try {
      vi.mocked(comercioRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("hash" as never);
      vi.mocked(comercioRepository.create).mockResolvedValue({
        id: 5,
        slug: "kiosco",
      } as any);
      vi.mocked(usuarioRepository.create).mockResolvedValue({
        id: 1,
        nombre: "Dueño",
        email: "a@a.com",
        password: "hash",
        rol: "ADMIN",
      } as any);

      const esperado = calcularNuevoAcceso({
        accesoHastaActual: null,
        ahora: new Date(),
        dias: DIAS_PRUEBA,
      });

      await comercioService.registrar({
        nombre: "Kiosco",
        adminNombre: "Dueño",
        adminEmail: "a@a.com",
        adminPassword: "secreta123",
      });

      expect(comercioRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "PRUEBA", accesoHasta: esperado }),
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([0, 366, 1.5])("rechaza días fuera de 1..365 (%s)", async (dias) => {
    await expect(
      comercioService.registrar({
        nombre: "Kiosco",
        adminNombre: "Dueño",
        adminEmail: "a@a.com",
        adminPassword: "secreta123",
        dias,
      })
    ).rejects.toThrow(BadRequestError);

    expect(comercioRepository.create).not.toHaveBeenCalled();
  });
});
