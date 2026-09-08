import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { usuarioRepository } from "../repositores/usuario.repository";
import { RolUsuario } from "../generated/prisma/client";

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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

export const usuarioService = {
  getAll: () => usuarioRepository.findAll(),

  getById: async (id: number) => {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
      throw new Error("Usuario no encontrado");
    }
    return usuario;
  },

  create: async (data: CrearUsuarioDTO) => {
    const existente = await usuarioRepository.findByEmail(data.email);
    if (existente) {
      throw new Error("Ya existe un usuario con ese email");
    }

    // Validación: no permitir crear más de un ADMIN
    if (data.rol === "ADMIN") {
      const admins = await usuarioRepository.findByRol("ADMIN");
      if (admins.length >= 1) {
        throw new Error("Ya existe un administrador en el sistema");
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
      throw new Error("Credenciales inválidas");
    }

    const passwordValida = await bcrypt.compare(data.password, usuario.password);
    if (!passwordValida) {
      throw new Error("Credenciales inválidas");
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );

    const { password, ...usuarioSinPassword } = usuario;
    return { usuario: usuarioSinPassword, token };
  },

  update: async (id: number, data: ActualizarUsuarioDTO) => {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
      throw new Error("Usuario no encontrado");
    }

    // Si intenta ascender a alguien más a ADMIN, validar que no haya otro ya
    if (data.rol === "ADMIN" && usuario.rol !== "ADMIN") {
      const admins = await usuarioRepository.findByRol("ADMIN");
      if (admins.length >= 1) {
        throw new Error("Ya existe un administrador en el sistema");
      }
    }

    return usuarioRepository.update(id, data);
  },

  delete: async (id: number) => {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
      throw new Error("Usuario no encontrado");
    }

    // Validación: no eliminar el último ADMIN
    if (usuario.rol === "ADMIN") {
      const admins = await usuarioRepository.findByRol("ADMIN");
      if (admins.length <= 1) {
        throw new Error("No se puede eliminar el único administrador del sistema");
      }
    }

    return usuarioRepository.delete(id);
  },
};