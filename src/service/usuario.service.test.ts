import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { usuarioService } from "./usuario.service";
import { usuarioRepository } from "../repositores/usuario.repository";
import { refreshTokenRepository } from "../repositores/refreshToken.repository";
import { comercioRepository } from "../repositores/comercio.repository";
import { NotFoundError, ConflictError, UnauthorizedError } from "../utils/errors";

vi.mock("../repositores/usuario.repository");
vi.mock("../repositores/refreshToken.repository");
vi.mock("../repositores/comercio.repository");

// Mockeamos bcrypt y jsonwebtoken: no queremos hashear/firmar de verdad en
// un test, solo controlar qué devuelven para poder armar los distintos casos.
vi.mock("bcrypt");
vi.mock("jsonwebtoken");

const COMERCIO = { id: 1, nombre: "Kiosco", slug: "kiosco", activo: true } as any;

const usuarioFalso = {
  id: 1,
  nombre: "Admin",
  email: "admin@test.com",
  password: "hash-guardado-en-bd",
  rol: "ADMIN" as const,
  activo: true,
  comercioId: 1,
  fechaCreacion: new Date(),
  fechaActualizacion: new Date(),
};

describe("usuarioService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza ConflictError si ya existe un usuario con ese email en el comercio", async () => {
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(usuarioFalso);

    await expect(
      usuarioService.create({ nombre: "Nuevo", email: "admin@test.com", password: "123456" }, 1)
    ).rejects.toThrow(ConflictError);
    expect(usuarioRepository.findByEmailAndComercio).toHaveBeenCalledWith(1, "admin@test.com");
  });

  it("lanza ConflictError si intenta crear un segundo ADMIN en el mismo comercio", async () => {
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(null);
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([usuarioFalso]); // ya hay 1 admin

    await expect(
      usuarioService.create({ nombre: "Otro", email: "otro@test.com", password: "123456", rol: "ADMIN" }, 1)
    ).rejects.toThrow(ConflictError);
    expect(usuarioRepository.findByRol).toHaveBeenCalledWith(1, "ADMIN");
  });

  it("permite un ADMIN si en ese comercio no hay ninguno (aunque exista en otro)", async () => {
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(null);
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([]); // 0 admins en comercio 2
    vi.mocked(bcrypt.hash).mockResolvedValue("password-hasheada" as never);
    vi.mocked(usuarioRepository.create).mockResolvedValue({ ...usuarioFalso, id: 9 } as any);

    await usuarioService.create(
      { nombre: "Admin2", email: "admin2@test.com", password: "123456", rol: "ADMIN" },
      2
    );

    expect(usuarioRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ rol: "ADMIN", comercio: { connect: { id: 2 } } })
    );
  });

  it("crea el usuario con password hasheada y sin devolverla en el resultado", async () => {
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(null);
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
    }, 1);

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

  it("lanza UnauthorizedError si el comercio no existe", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(null);

    await expect(
      usuarioService.login({ slug: "fantasma", email: "admin@test.com", password: "123456" })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("lanza UnauthorizedError si el usuario no pertenece a ese comercio", async () => {
    // Mismo email existe, pero en OTRO comercio: la búsqueda es por (comercio, email).
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(COMERCIO);
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(null);

    await expect(
      usuarioService.login({ slug: "kiosco", email: "admin@test.com", password: "123456" })
    ).rejects.toThrow(UnauthorizedError);
    expect(usuarioRepository.findByEmailAndComercio).toHaveBeenCalledWith(1, "admin@test.com");
  });

  it("lanza UnauthorizedError si el usuario está inactivo", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(COMERCIO);
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue({ ...usuarioFalso, activo: false });

    await expect(
      usuarioService.login({ slug: "kiosco", email: "admin@test.com", password: "123456" })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("lanza UnauthorizedError si la contraseña no coincide", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(COMERCIO);
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(usuarioFalso);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      usuarioService.login({ slug: "kiosco", email: "admin@test.com", password: "incorrecta" })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("devuelve tokens con comercioId en el JWT y datos del comercio", async () => {
    vi.mocked(comercioRepository.findBySlug).mockResolvedValue(COMERCIO);
    vi.mocked(usuarioRepository.findByEmailAndComercio).mockResolvedValue(usuarioFalso);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue("access-token-falso" as never);
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as any);

    const resultado = await usuarioService.login({ slug: "kiosco", email: "admin@test.com", password: "correcta" });

    expect(vi.mocked(jwt.sign).mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: 1, rol: "ADMIN", comercioId: 1 })
    );
    expect(resultado.accessToken).toBe("access-token-falso");
    expect(resultado.refreshToken).toBeDefined();
    expect(resultado.comercio).toEqual({ id: 1, nombre: "Kiosco", slug: "kiosco" });
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

  it("rota el token re-derivando el comercio del usuario (no del pedido)", async () => {
    vi.mocked(refreshTokenRepository.findByToken).mockResolvedValue({
      id: 1, usuarioId: 1, token: "abc", revocado: false,
      expiraEn: new Date(Date.now() + 100000), fechaCreacion: new Date(),
    });
    vi.mocked(usuarioRepository.findByIdParaRefresh).mockResolvedValue({
      id: 1, rol: "ADMIN", comercioId: 1, activo: true,
    } as any);
    vi.mocked(refreshTokenRepository.revocar).mockResolvedValue({} as any);
    vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as any);
    vi.mocked(jwt.sign).mockReturnValue("nuevo-access-token" as never);

    const resultado = await usuarioService.refresh("abc");

    expect(refreshTokenRepository.revocar).toHaveBeenCalledWith(1, 1); // se revocó el viejo
    expect(vi.mocked(jwt.sign).mock.calls[0][0]).toEqual(
      expect.objectContaining({ comercioId: 1 })
    );
    expect(resultado.accessToken).toBe("nuevo-access-token");
    expect(resultado.refreshToken).toBeDefined();
  });
});

describe("usuarioService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revoca todas las sesiones cuando activo pasa a false", async () => {
    const vendedor = { ...usuarioFalso, id: 3, rol: "VENDEDOR" as const };
    vi.mocked(usuarioRepository.findById).mockResolvedValue(vendedor);
    vi.mocked(refreshTokenRepository.revocarTodosDeUsuario).mockResolvedValue({ count: 2 } as any);
    vi.mocked(usuarioRepository.update).mockResolvedValue({ ...vendedor, activo: false });

    await usuarioService.update(3, 1, { activo: false });

    expect(refreshTokenRepository.revocarTodosDeUsuario).toHaveBeenCalledWith(3);
    expect(usuarioRepository.update).toHaveBeenCalledWith(3, 1, { activo: false });
  });

  it("no revoca sesiones si el usuario sigue activo", async () => {
    const vendedor = { ...usuarioFalso, id: 3, rol: "VENDEDOR" as const };
    vi.mocked(usuarioRepository.findById).mockResolvedValue(vendedor);
    vi.mocked(usuarioRepository.update).mockResolvedValue({ ...vendedor, nombre: "Nuevo" });

    await usuarioService.update(3, 1, { nombre: "Nuevo" });

    expect(refreshTokenRepository.revocarTodosDeUsuario).not.toHaveBeenCalled();
  });
});

describe("usuarioService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el usuario no existe en ese comercio", async () => {
    vi.mocked(usuarioRepository.findById).mockResolvedValue(null);

    await expect(usuarioService.delete(999, 1)).rejects.toThrow(NotFoundError);
    expect(usuarioRepository.findById).toHaveBeenCalledWith(999, 1);
  });

  it("lanza ConflictError si es el único ADMIN del comercio", async () => {
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso); // rol: ADMIN
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([usuarioFalso]); // solo 1 admin

    await expect(usuarioService.delete(1, 1)).rejects.toThrow(ConflictError);
  });

  it("permite eliminar un ADMIN si hay más de uno en el comercio", async () => {
    const otroAdmin = { ...usuarioFalso, id: 2 };
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso);
    vi.mocked(usuarioRepository.findByRol).mockResolvedValue([usuarioFalso, otroAdmin]); // hay 2
    vi.mocked(refreshTokenRepository.revocarTodosDeUsuario).mockResolvedValue({} as any);
    vi.mocked(usuarioRepository.delete).mockResolvedValue(usuarioFalso);

    await usuarioService.delete(1, 1);

    expect(usuarioRepository.delete).toHaveBeenCalledWith(1, 1);
  });

  it("revoca todas las sesiones activas del usuario al eliminarlo", async () => {
    const vendedor = { ...usuarioFalso, id: 3, rol: "VENDEDOR" as const };
    vi.mocked(usuarioRepository.findById).mockResolvedValue(vendedor);
    vi.mocked(refreshTokenRepository.revocarTodosDeUsuario).mockResolvedValue({} as any);
    vi.mocked(usuarioRepository.delete).mockResolvedValue(vendedor);

    await usuarioService.delete(3, 1);

    expect(refreshTokenRepository.revocarTodosDeUsuario).toHaveBeenCalledWith(3);
  });
});
