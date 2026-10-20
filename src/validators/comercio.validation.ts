import { z } from "zod";

export const registrarComercioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre del comercio es obligatorio").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "El identificador solo admite minúsculas, números y guiones")
    .max(80)
    .optional(),
  adminNombre: z.string().trim().min(1, "El nombre del administrador es obligatorio").max(120),
  adminEmail: z.email("El email no es válido"),
  adminPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
}).strict();

export type RegistrarComercioInput = z.infer<typeof registrarComercioSchema>;
