import { z } from "zod";

export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  email: z.email("El email no es válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  rol: z.enum(["ADMIN", "VENDEDOR"]).optional(),
});

export const loginSchema = z.object({
  email: z.email("El email no es válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

// valida el body de /refresh y /logout
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "El refreshToken es obligatorio"),
});

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  email: z.email().optional(),
  rol: z.enum(["ADMIN", "VENDEDOR"]).optional(),
  activo: z.boolean().optional(),
}).strict();

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type LoginInput = z.infer<typeof loginSchema>;