import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { usuarioRepository } from "../repositores/usuario.repository";
import { refreshTokenRepository } from "../repositores/refreshToken.repository";
import { comercioRepository } from "../repositores/comercio.repository";
import { RolUsuario } from "../generated/prisma/client";
import { NotFoundError, ConflictError, UnauthorizedError } from "../utils/errors";

export interface CrearUsuarioDTO {
  nombre: string;
  email: string;
  password: string;
  rol?: RolUsuario;
}

export interface LoginDTO {
  slug: string;
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

// Los refresh tokens se guardan hasheados: si se filtra la base, los valores
// almacenados no sirven para autenticarse.
const hashearToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

// Genera el access token (JWT firmado, de vida corta). Incluye el comercio para
// que ningún endpoint opere sin scope: el comercioId nunca viene del cliente.
const generarAccessToken = (usuario: { id: number; rol: RolUsuario; comercioId: number }) =>
  jwt.sign(
    { id: usuario.id, rol: usuario.rol, comercioId: usuario.comercioId },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN } as jwt.SignOptions
  );

// Genera y persiste un refresh token nuevo para el usuario (cadena aleatoria, no JWT)
const generarRefreshToken = async (usuarioId: number) => {
  const token = crypto.randomBytes(40).toString("hex");
  const expiraEn = new Date(Date.now() + REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000);
  await refreshTokenRepository.create(usuarioId, hashearToken(token), expiraEn);
  return token;
};

export const usuarioService = {
  getAll: (comercioId: number) => usuarioRepository.findAll(comercioId),

  getById: async (id: number, comercioId: number) => {
    const usuario = await usuarioRepository.findById(id, comercioId);
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }
    return usuario;
  },

  create: async (data: CrearUsuarioDTO, comercioId: number) => {
    const email = data.email.trim().toLowerCase();
    const existente = await usuarioRepository.findByEmailAndComercio(comercioId, email);
    if (existente) {
      throw new ConflictError("Ya existe un usuario con ese email en este comercio");
    }

    if (data.rol === "ADMIN") {
      const admins = await usuarioRepository.findByRol(comercioId, "ADMIN");
      if (admins.length >= 1) {
        throw new ConflictError("Ya existe un administrador en este comercio");
      }
    }

    const passwordHasheada = await bcrypt.hash(data.password, 10);

    const usuario = await usuarioRepository.create({
      nombre: data.nombre,
      email,
      password: passwordHasheada,
      rol: data.rol ?? "VENDEDOR",
      comercio: { connect: { id: comercioId } },
    });

    const { password, ...usuarioSinPassword } = usuario;
    return usuarioSinPassword;
  },

  login: async (data: LoginDTO) => {
    // El comercio se resuelve por slug; si no existe o está inactivo, el error
    // es genérico para no revelar qué slugs/emails existen.
    const comercio = await comercioRepository.findBySlug(data.slug.trim().toLowerCase());
    const usuario = comercio
      ? await usuarioRepository.findByEmailAndComercio(
          comercio.id,
          data.email.trim().toLowerCase()
        )
      : null;

    if (!comercio || !comercio.activo || !usuario || !usuario.activo) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const passwordValida = await bcrypt.compare(data.password, usuario.password);
    if (!passwordValida) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const accessToken = generarAccessToken(usuario);
    const refreshToken = await generarRefreshToken(usuario.id);

    const { password, ...usuarioSinPassword } = usuario;
    return {
      usuario: usuarioSinPassword,
      comercio: { id: comercio.id, nombre: comercio.nombre, slug: comercio.slug },
      accessToken,
      refreshToken,
    };
  },

  // recibe un refresh token válido y devuelve un access token nuevo,
  // rotando (revocando el viejo y emitiendo uno nuevo) por seguridad.
  // El comercioId del token nuevo se re-deriva del usuario, nunca del pedido.
  refresh: async (refreshTokenRecibido: string) => {
    const registrado = await refreshTokenRepository.findByToken(
      hashearToken(refreshTokenRecibido)
    );

    if (!registrado || registrado.revocado || registrado.expiraEn < new Date()) {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    const usuario = await usuarioRepository.findByIdParaRefresh(registrado.usuarioId);
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedError("Usuario no encontrado o inactivo");
    }

    // Un comercio suspendido no puede renovar su sesión. Este chequeo va ANTES
    // de la rotación: si se rechaza, el refresh token queda sin consumir y
    // sigue sirviendo cuando el comercio se reactive.
    const comercio = await comercioRepository.findById(usuario.comercioId);
    if (!comercio || !comercio.activo) {
      throw new UnauthorizedError("El comercio está suspendido");
    }

    // Rotación: se invalida el token usado y se emite uno nuevo
    await refreshTokenRepository.revocar(registrado.id, registrado.usuarioId);
    const nuevoRefreshToken = await generarRefreshToken(usuario.id);
    const nuevoAccessToken = generarAccessToken(usuario);

    return { accessToken: nuevoAccessToken, refreshToken: nuevoRefreshToken };
  },

  // revoca el refresh token recibido
  logout: async (refreshTokenRecibido: string) => {
    const registrado = await refreshTokenRepository.findByToken(
      hashearToken(refreshTokenRecibido)
    );
    if (registrado) {
      await refreshTokenRepository.revocar(registrado.id, registrado.usuarioId);
    }
    // No lanzamos error si no se encuentra: el efecto deseado (que ese token
    // ya no sirva) se cumple igual, y no hace falta filtrar esa información.
  },

    update: async (id: number, comercioId: number, data: ActualizarUsuarioDTO) => {
    const usuario = await usuarioRepository.findById(id, comercioId);
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }

    if (data.rol === "ADMIN" && usuario.rol !== "ADMIN") {
      const admins = await usuarioRepository.findByRol(comercioId, "ADMIN");
      if (admins.length >= 1) {
        throw new ConflictError("Ya existe un administrador en este comercio");
      }
    }

    // No se puede dejar al comercio sin un administrador activo: ni quitándole
    // el rol ni desactivando al único que queda. Va ANTES de revocar sesiones:
    // si se rechaza el cambio, el admin no debe perder sus tokens.
    const dejaDeSerAdminActivo =
      usuario.rol === "ADMIN" &&
      usuario.activo &&
      (data.activo === false || data.rol === "VENDEDOR");

    if (dejaDeSerAdminActivo) {
      const admins = await usuarioRepository.findByRol(comercioId, "ADMIN");
      if (admins.length <= 1) {
        throw new ConflictError(
          "No se puede desactivar ni quitar el rol al único administrador del comercio"
        );
      }
    }

    if (data.email) {
      const email = data.email.trim().toLowerCase();
      const existente = await usuarioRepository.findByEmailAndComercio(comercioId, email);
      if (existente && existente.id !== id) {
        throw new ConflictError("Ya existe un usuario con ese email en este comercio");
      }
      data = { ...data, email };
    }

    // Desactivar es equivalente a dar de baja: se revocan todas las sesiones
    // activas para que no pueda seguir operando con sus tokens vigentes.
    if (data.activo === false) {
      await refreshTokenRepository.revocarTodosDeUsuario(id);
    }

    return usuarioRepository.update(id, comercioId, data);
  },

  delete: async (id: number, comercioId: number) => {
    const usuario = await usuarioRepository.findById(id, comercioId);
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }

    if (usuario.rol === "ADMIN") {
      const admins = await usuarioRepository.findByRol(comercioId, "ADMIN");
      if (admins.length <= 1) {
        throw new ConflictError("No se puede eliminar el único administrador del comercio");
      }
    }

    // Al desactivar un usuario, además revocamos todas sus sesiones activas
    await refreshTokenRepository.revocarTodosDeUsuario(id);
    return usuarioRepository.delete(id, comercioId);
  },
};