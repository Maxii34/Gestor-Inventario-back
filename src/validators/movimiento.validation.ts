import { z } from "zod";

export const crearMovimientoSchema = z.object({
  tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"], {
    error: "El tipo debe ser ENTRADA, SALIDA o AJUSTE",
  }),
  cantidad: z
    .number({ error: "La cantidad debe ser un número" })
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser mayor a 0"),
  productoId: z
    .number({ error: "El productoId debe ser un número" })
    .int("El productoId debe ser un número entero")
    .positive("El productoId debe ser mayor a 0"),
  motivo: z.string().trim().min(1).optional(),
});

export const actualizarMovimientoSchema = z.object({
  motivo: z.string().trim().min(1).optional(),
});

export type CrearMovimientoInput = z.infer<typeof crearMovimientoSchema>;
export type ActualizarMovimientoInput = z.infer<typeof actualizarMovimientoSchema>;