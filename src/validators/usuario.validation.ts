import { z } from "zod";

// Se limpia (trim + minúsculas) y recién después se valida el formato.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("El email no es válido"));

// bcrypt solo usa los primeros 72 BYTES de la contraseña: una más larga se
// recortaría en silencio. Se mide en bytes porque "ñ" o una tilde ocupan 2.
const passwordNueva = z
  .string()
  .min(6, "La contraseña debe tener al menos 6 caracteres")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, {
    message: "La contraseña es demasiado larga (máximo 72 bytes)",
  });

export const crearUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
    email: emailSchema,
    password: passwordNueva,
    rol: z.enum(["ADMIN", "VENDEDOR"]).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    slug: z.string().trim().min(1, "El identificador del comercio es obligatorio").max(80),
    email: emailSchema,
    password: z.string().min(1, "La contraseña es obligatoria").max(200),
  })
  .strict();

// valida el body de /refresh y /logout
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, "El refreshToken es obligatorio").max(500),
  })
  .strict();

export const actualizarUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    email: emailSchema.optional(),
    rol: z.enum(["ADMIN", "VENDEDOR"]).optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "Enviá al menos un campo para actualizar",
  });

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;