import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { usuarioService } from "./usuario.service";
import { usuarioRepository } from "../repositores/usuario.repository";
import { refreshTokenRepository } from "../repositores/refreshToken.repository";
import { NotFoundError, ConflictError, UnauthorizedError } from "../utils/errors";

vi.mock("../repositores/usuario.repository");
vi.mock("../repositores/refreshToken.repository");

// Mockeamos bcrypt y jsonwebtoken: no queremos hashear/firmar de verdad en
// un test, solo controlar qué devuelven para poder armar los distintos casos.
vi.mock("bcrypt");
vi.mock("jsonwebtoken");

const usuarioFalso = {
  id: 1,
  nombre: "Admin",
  email: "admin@test.com",
  password: "hash-guardado-en-bd",
  rol: "ADMIN" as const,
  activo: true,
  fechaCreacion: new Date(),
  fechaActualizacion: new Date(),
};

describe("usuarioService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza ConflictError si ya existe un usuario con ese email", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(usuarioFalso);

    await expect(
      usuarioService.create({ nombre: "Nuevo", email: "admin@test.com", password: "123456" })
    ).rejects.toThrow(ConflictError);
  });

  it("lanza ConflictError si intenta crear un segundo ADMIN", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([usuarioFalso]); // ya hay 1 admin

    await expect(
      usuarioService.create({ nombre: "Otro", email: "otro@test.com", password: "123456", rol: "ADMIN" })
    ).rejects.toThrow(ConflictError);
  });

  it("crea el usuario con password hasheada y sin devolverla en el resultado", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("password-hasheada" as never);
    vi.mocked(usuarioRepository.create).mockResolvedValue({
      ...usuarioFalso,
      rol: "VENDEDOR",
      password: "password-hasheada",
    });

    const resultado = await usuarioService.create({
      nombre: "Carlos",
      email: "carlos@test.com",
      password: "123456",
    });

    // La contraseña nunca debe viajar en la respuesta
    expect(resultado).not.toHaveProperty("password");
    // Se guardó el hash, no la contraseña en texto plano
    expect(usuarioRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ password: "password-hasheada" })
    );
  });
});

describe("usuarioService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza UnauthorizedError si el email no existe", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(null);

    await expect(
      usuarioService.login({ email: "no-existe@test.com", password: "123456" })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("lanza UnauthorizedError si el usuario está inactivo", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue({ ...usuarioFalso, activo: false });

    await expect(
      usuarioService.login({ email: "admin@test.com", password: "123456" })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("lanza UnauthorizedError si la contraseña no coincide", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(usuarioFalso);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      usuarioService.login({ email: "admin@test.com", password: "incorrecta" })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("devuelve accessToken y refreshToken con credenciales correctas", async () => {
    vi.mocked(usuarioRepository.findByEmail).mockResolvedValue(usuarioFalso);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue("access-token-falso" as never);
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as any);

    const resultado = await usuarioService.login({ email: "admin@test.com", password: "correcta" });

    expect(resultado.accessToken).toBe("access-token-falso");
    expect(resultado.refreshToken).toBeDefined();
    expect(resultado.usuario).not.toHaveProperty("password");
  });
});

describe("usuarioService.refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza UnauthorizedError si el token no existe", async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue(null);

    await expect(usuarioService.refresh("token-inexistente")).rejects.toThrow(UnauthorizedError);
  });

  it("lanza UnauthorizedError si el token ya fue revocado", async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue({
      id: 1, usuarioId: 1, token: "abc", revocado: true,
      expiraEn: new Date(Date.now() + 100000), fechaCreacion: new Date(),
    });

    await expect(usuarioService.refresh("abc")).rejects.toThrow(UnauthorizedError);
  });

  it("lanza UnauthorizedError si el token ya expiró", async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue({
      id: 1, usuarioId: 1, token: "abc", revocado: false,
      expiraEn: new Date(Date.now() - 1000), // ya expiró
      fechaCreacion: new Date(),
    });

    await expect(usuarioService.refresh("abc")).rejects.toThrow(UnauthorizedError);
  });

  it("rota el token: revoca el usado y devuelve uno nuevo", async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue({
      id: 1, usuarioId: 1, token: "abc", revocado: false,
      expiraEn: new Date(Date.now() + 100000), fechaCreacion: new Date(),
    });
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso);
    vi.mocked(refreshTokenRepository.revocar).mockResolvedValue({} as any);
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as any);
    vi.mocked(jwt.sign).mockReturnValue("nuevo-access-token" as never);

    const resultado = await usuarioService.refresh("abc");

    expect(refreshTokenRepository.revocar).toHaveBeenCalledWith(1); // se revocó el viejo
    expect(resultado.accessToken).toBe("nuevo-access-token");
    expect(resultado.refreshToken).toBeDefined();
  });
});

describe("usuarioService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el usuario no existe", async () => {
    vi.mocked(usuarioRepository.findById).mockResolvedValue(null);

    await expect(usuarioService.delete(999)).rejects.toThrow(NotFoundError);
  });

  it("lanza ConflictError si es el único ADMIN del sistema", async () => {
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso); // rol: ADMIN
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([usuarioFalso]); // solo 1 admin

    await expect(usuarioService.delete(1)).rejects.toThrow(ConflictError);
  });

  it("permite eliminar un ADMIN si hay más de uno", async () => {
    const otroAdmin = { ...usuarioFalso, id: 2 };
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso);
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([usuarioFalso, otroAdmin]); // hay 2
    vi.mocked(refreshTokenRepository.revocarTodosDeUsuario).mockResolvedValue({} as any);
    vi.mocked(usuarioRepository.delete).mockResolvedValue(usuarioFalso);

    await usuarioService.delete(1);

    expect(usuarioRepository.delete).toHaveBeenCalledWith(1);
  });

  it("revoca todas las sesiones activas del usuario al eliminarlo", async () => {
    const vendedor = { ...usuarioFalso, id: 3, rol: "VENDEDOR" as const };
    vi.mocked(usuarioRepository.findById).mockResolvedValue(vendedor);
    vi.mocked(refreshTokenRepository.revocarTodosDeUsuario).mockResolvedValue({} as any);
    vi.mocked(usuarioRepository.delete).mockResolvedValue(vendedor);

    await usuarioService.delete(3);

    expect(refreshTokenRepository.revocarTodosDeUsuario).toHaveBeenCalledWith(3);
  });
});