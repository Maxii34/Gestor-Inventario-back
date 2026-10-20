import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { comercioRepository } from "../repositores/comercio.repository";
import { usuarioRepository } from "../repositores/usuario.repository";
import { ConflictError, BadRequestError, NotFoundError } from "../utils/errors";

export interface RegistrarComercioDTO {
  nombre: string;
  slug?: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
}

// Convierte un nombre en slug: minúsculas, espacios a guiones, solo [a-z0-9-].
export const normalizarSlug = (texto: string) =>
  texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

export const comercioService = {
  getBySlug: async (slug: string) => {
    const comercio = await comercioRepository.findBySlug(slug);
    if (!comercio || !comercio.activo) {
      throw new NotFoundError("Comercio no encontrado");
    }
    return comercio;
  },

  // Alta inicial: crea el comercio y su primer ADMIN en una transacción.
  // Es el único flujo que crea un usuario sin token previo, y nunca puede
  // crear administradores en comercios existentes ni asignar usuarios ajenos.
  registrar: async (data: RegistrarComercioDTO) => {
    const slug = normalizarSlug(data.slug ?? data.nombre);
    if (!slug) {
      throw new BadRequestError("No se pudo generar un identificador válido para el comercio");
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestError("El identificador del comercio no es válido");
    }
    const email = data.adminEmail.trim().toLowerCase();
    if (!email) {
      throw new BadRequestError("El email del administrador es obligatorio");
    }

    const existente = await comercioRepository.findBySlug(slug);
    if (existente) {
      throw new ConflictError("Ya existe un comercio con ese identificador");
    }

    const passwordHasheada = await bcrypt.hash(data.adminPassword, 10);

    const resultado = await prisma.$transaction(async (tx) => {
      const comercio = await comercioRepository.create(
        { nombre: data.nombre.trim(), slug },
        tx
      );

      const administrador = await usuarioRepository.create(
        {
          nombre: data.adminNombre.trim(),
          email,
          password: passwordHasheada,
          rol: "ADMIN",
          comercio: { connect: { id: comercio.id } },
        },
        tx
      );

      return { comercio, administrador };
    });

    const { password: _omitida, ...administradorSinPassword } = resultado.administrador;
    return { comercio: resultado.comercio, administrador: administradorSinPassword };
  },
};
