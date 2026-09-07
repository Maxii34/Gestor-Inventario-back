import { z } from "zod";

export const crearClienteSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  apellido: z.string().trim().min(1, "El apellido es obligatorio"),
  dni: z.string().trim().min(1).optional(),
  telefono: z.string().trim().min(1).optional(),
  email: z.email("El email no es válido").optional(),
});

export const actualizarClienteSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  apellido: z.string().trim().min(1).optional(),
  dni: z.string().trim().min(1).optional(),
  telefono: z.string().trim().min(1).optional(),
  email: z.email("El email no es válido").optional(),
}).strict();

export type CrearClienteInput = z.infer<typeof crearClienteSchema>;
export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;