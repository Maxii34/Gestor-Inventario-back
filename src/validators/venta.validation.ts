import { z } from "zod";
import { diferenciaEnDias, esFechaISOValida } from "../utils/fechas";

export const detalleVentaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().int().positive(),
});

export const crearVentaSchema = z.object({
  clienteId: z.number().int().positive().optional(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]),
  detalles: z.array(detalleVentaSchema).min(1, "Debe incluir al menos un detalle"),
});

export const actualizarVentaSchema = z.object({
  estado: z.enum(["COMPLETADA", "ANULADA"]).optional(),
}).strict();

export const anularVentaSchema = z.object({
  motivo: z.string().trim().min(1, "El motivo de anulación es obligatorio").max(500),
}).strict();

const fechaQuerySchema = (nombre: "desde" | "hasta") =>
  z
    .string()
    .refine(
      esFechaISOValida,
      `La fecha '${nombre}' debe ser válida (formato AAAA-MM-DD)`
    );

const validarRango = (
  query: { desde?: string; hasta?: string },
  ctx: z.RefinementCtx
) => {
  if (query.desde === undefined || query.hasta === undefined) {
    return;
  }

  if (query.desde > query.hasta) {
    ctx.addIssue({
      code: "custom",
      message: "La fecha 'desde' no puede ser posterior a 'hasta'",
      path: ["desde"],
    });
    return;
  }

  if (diferenciaEnDias(query.desde, query.hasta) > 366) {
    ctx.addIssue({
      code: "custom",
      message: "El rango de fechas no puede superar los 366 días",
      path: ["hasta"],
    });
  }
};

export const ventasQuerySchema = z
  .object({
    vendedorId: z.coerce
      .number()
      .int()
      .positive("El vendedorId debe ser un entero positivo")
      .optional(),
    desde: fechaQuerySchema("desde").optional(),
    hasta: fechaQuerySchema("hasta").optional(),
    estado: z.enum(["PENDIENTE", "COMPLETADA", "ANULADA", "RECHAZADA"]).optional(),
    metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]).optional(),
  })
  .superRefine(validarRango);

export const rangoFechasQuerySchema = z
  .object({
    desde: fechaQuerySchema("desde").optional(),
    hasta: fechaQuerySchema("hasta").optional(),
  })
  .superRefine(validarRango);

export type VentasQuery = z.infer<typeof ventasQuerySchema>;
export type RangoFechasQuery = z.infer<typeof rangoFechasQuerySchema>;

export type CrearVentaInput = z.infer<typeof crearVentaSchema>;
