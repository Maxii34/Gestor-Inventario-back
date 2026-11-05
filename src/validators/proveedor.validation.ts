import { z } from "zod";

export const crearProveedorSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  telefono: z.string().trim().min(1).optional(),
  email: z.email("El email no es válido").optional(),
});

export const actualizarProveedorSchema = z.object({
    nombre: z.string().trim().min(1).optional(),
    telefono: z.string().trim().min(1).optional(),
    email: z.email("El email no es válido").optional(),
}).strict();

export type CrearProveedorInput = z.infer<typeof crearProveedorSchema>;
export type ActualizarProveedorInput = z.infer<typeof actualizarProveedorSchema>;