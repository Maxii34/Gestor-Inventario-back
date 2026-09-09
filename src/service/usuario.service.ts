import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { usuarioRepository } from "../repositores/usuario.repository";
import { refreshTokenRepository } from "../repositores/refreshToken.repository";
import { RolUsuario } from "../generated/prisma/client";
import { NotFoundError, ConflictError, UnauthorizedError } from "../utils/errors";

export interface CrearUsuarioDTO {
  nombre: string;
  email: string;
  password: string;
  rol?: RolUsuario;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface ActualizarUsuarioDTO {
  nombre?: string;
  email?: string;
  rol?: RolUsuario;
  activo?: boolean;
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const ACCESS_TOKEN_EXPIRES_IN = "1h"; // antes 8h, ahora vida corta porque hay refresh token
const REFRESH_TOKEN_DIAS = 7;

// Genera el access token (JWT firmado, de vida corta)
const generarAccessToken = (usuario: { id: number; rol: RolUsuario }) =>
  jwt.sign(
    { id: usuario.id, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN } as jwt.SignOptions
  );

// Genera y persiste un refresh token nuevo para el usuario (cadena aleatoria, no JWT)
const generarRefreshToken = async (usuarioId: number) => {
  const token = crypto.randomBytes(40).toString("hex");
  const expiraEn = new Date(Date.now() + REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000);
  await refreshTokenRepository.create(usuarioId, token, expiraEn);
  return token;
};

export const usuarioService = {
  getAll: () => usuarioRepository.findAll(),

  getById: async (id: number) => {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }
    return usuario;
  },

  create: async (data: CrearUsuarioDTO) => {
    const existente = await usuarioRepository.findByEmail(data.email);
    if (existente) {
      throw new ConflictError("Ya existe un usuario con ese email");
    }

    if (data.rol === "ADMIN") {
      const admins = await usuarioRepository.findByRol("ADMIN");
      if (admins.length >= 1) {
        throw new ConflictError("Ya existe un administrador en el sistema");
      }
    }

    const passwordHasheada = await bcrypt.hash(data.password, 10);

    const usuario = await usuarioRepository.create({
      nombre: data.nombre,
      email: data.email,
      password: passwordHasheada,
      rol: data.rol ?? "VENDEDOR",
    });

    const { password, ...usuarioSinPassword } = usuario;
    return usuarioSinPassword;
  },

  login: async (data: LoginDTO) => {
    const usuario = await usuarioRepository.findByEmail(data.email);
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const passwordValida = await bcrypt.compare(data.password, usuario.password);
    if (!passwordValida) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const accessToken = generarAccessToken(usuario);
    const refreshToken = await generarRefreshToken(usuario.id);

    const { password, ...usuarioSinPassword } = usuario;
    return { usuario: usuarioSinPassword, accessToken, refreshToken };
  },

  // recibe un refresh token válido y devuelve un access token nuevo,
  // rotando (revocando el viejo y emitiendo uno nuevo) por seguridad.
  refresh: async (refreshTokenRecibido: string) => {
    const registrado = await refreshTokenRepository.findByToken(refreshTokenRecibido);

    if (!registrado || registrado.revocado || registrado.expiraEn < new Date()) {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    const usuario = await usuarioRepository.findById(registrado.usuarioId);
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedError("Usuario no encontrado o inactivo");
    }

    // Rotación: se invalida el token usado y se emite uno nuevo
    await refreshTokenRepository.revocar(registrado.id);
    const nuevoRefreshToken = await generarRefreshToken(usuario.id);
    const nuevoAccessToken = generarAccessToken(usuario);

    return { accessToken: nuevoAccessToken, refreshToken: nuevoRefreshToken };
  },

  // revoca el refresh token recibido
  logout: async (refreshTokenRecibido: string) => {
    const registrado = await refreshTokenRepository.findByToken(refreshTokenRecibido);
    if (registrado) {
      await refreshTokenRepository.revocar(registrado.id);
    }
    // No lanzamos error si no se encuentra: el efecto deseado (que ese token
    // ya no sirva) se cumple igual, y no hace falta filtrar esa información.
  },

  update: async (id: number, data: ActualizarUsuarioDTO) => {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }

    if (data.rol === "ADMIN" && usuario.rol !== "ADMIN") {
      const admins = await usuarioRepository.findByRol("ADMIN");
      if (admins.length >= 1) {
        throw new ConflictError("Ya existe un administrador en el sistema");
      }
    }

    return usuarioRepository.update(id, data);
  },

  delete: async (id: number) => {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }

    if (usuario.rol === "ADMIN") {
      const admins = await usuarioRepository.findByRol("ADMIN");
      if (admins.length <= 1) {
        throw new ConflictError("No se puede eliminar el único administrador del sistema");
      }
    }

    // Al desactivar un usuario, además revocamos todas sus sesiones activas
    await refreshTokenRepository.revocarTodosDeUsuario(id);
    return usuarioRepository.delete(id);
  },
};