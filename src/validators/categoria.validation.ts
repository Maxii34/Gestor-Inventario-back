import { z } from "zod";

export const categoriaSchema = z.object({
  nombre: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(100, "El nombre no puede superar los 100 caracteres"),

  descripcion: z
    .string()
    .trim()
    .max(200, "La descripción no puede superar los 200 caracteres")
    .optional(),

  activo: z.boolean().optional(),
});

export const updateCategoriaSchema = categoriaSchema.partial();

// Tipos inferidos automáticamente desde los schemas de Zod
export type CreateCategoriaInput = z.infer<typeof categoriaSchema>;
export type UpdateCategoriaInput = z.infer<typeof categoriaSchema>;