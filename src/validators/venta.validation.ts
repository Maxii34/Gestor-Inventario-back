import { z } from "zod";

export const detalleVentaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().int().positive(),
});

export const crearVentaSchema = z.object({
  clienteId: z.number().int().positive().optional(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "PEDIDO_DISTANCIA"]),
  detalles: z.array(detalleVentaSchema).min(1, "Debe incluir al menos un detalle"),
});

export const actualizarVentaSchema = z.object({
  estado: z.enum(["COMPLETADA", "ANULADA"]).optional(),
}).strict();

export type CrearVentaInput = z.infer<typeof crearVentaSchema>;