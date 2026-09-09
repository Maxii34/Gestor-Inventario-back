import { z } from "zod";

export const productoSchema = z.object({
  nombre: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(100, "El nombre no puede superar los 100 caracteres"),

  descripcion: z
    .string()
    .trim()
    .optional(),

  precioCompra: z
    .number({ error: "El precio de compra es obligatorio" })
    .positive("El precio de compra debe ser mayor a 0"),

  precioVenta: z
    .number({ error: "El precio de venta es obligatorio" })
    .positive("El precio de venta debe ser mayor a 0"),

  stock: z.number().int().nonnegative().optional(),
  stockMinimo: z.number().int().nonnegative().optional(),
  categoriaId: z.number({ error: "La categoría es obligatoria" }),
});

export const updateProductoSchema = productoSchema.partial();

export type CreateProductoInput = z.infer<typeof productoSchema>;
export type UpdateProductoInput = z.infer<typeof updateProductoSchema>;
