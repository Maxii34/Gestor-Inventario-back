import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { calcularPrecioCompraPorUnidad } from "../utils/precioProducto";

export const codigoBarrasSchema = z
  .string({ error: "El código de barras debe ser un texto" })
  .trim()
  .min(1, "El código de barras no puede estar vacío")
  .max(64, "El código de barras no puede superar los 64 caracteres")
  .regex(
    /^[\x21-\x7E]+$/,
    "El código de barras solo puede contener caracteres imprimibles sin espacios",
  );

const precioCompraSchema = z
  .number({ error: "El precio de compra debe ser un número" })
  .positive("El precio de compra debe ser mayor a 0");

const precioCompraPaqueteSchema = z
  .number({ error: "El precio del paquete debe ser un número" })
  .positive("El precio del paquete debe ser mayor a 0")
  .refine(
    (precio) => new Prisma.Decimal(precio).decimalPlaces() <= 2,
    "El precio del paquete no puede tener más de 2 decimales",
  );

const unidadesPorPaqueteSchema = z
  .number({ error: "Las unidades por paquete deben ser un número" })
  .int("Las unidades por paquete deben ser un número entero")
  .min(1, "Las unidades por paquete deben ser al menos 1")
  .max(100000, "Las unidades por paquete no pueden superar 100000");

const mensajeAmbosPrecios =
  "Enviá el costo por unidad o el costo del paquete, no ambos";
const mensajeNingunPrecio =
  "Enviá el costo por unidad o el costo del paquete";

type DatosDeCosto = {
  precioCompra?: number;
  precioCompraPaquete?: number | null;
};

const tienePrecioUnidad = (data: DatosDeCosto) =>
  data.precioCompra !== undefined;

const tienePrecioPaquete = (data: DatosDeCosto) =>
  data.precioCompraPaquete !== undefined &&
  data.precioCompraPaquete !== null;

export const validarCostoProducto = (
  data: DatosDeCosto,
  ctx: z.RefinementCtx,
  opciones: { exigirCosto: boolean } = { exigirCosto: true },
) => {
  const unidad = tienePrecioUnidad(data);
  const paquete = tienePrecioPaquete(data);

  if (unidad && paquete) {
    ctx.addIssue({
      code: "custom",
      path: ["precioCompra"],
      message: mensajeAmbosPrecios,
    });
    return;
  }

  if (opciones.exigirCosto && !unidad && !paquete) {
    ctx.addIssue({
      code: "custom",
      path: ["precioCompra"],
      message: mensajeNingunPrecio,
    });
  }
};

export const validarMargenProducto = (
  data: DatosDeCosto & {
    precioVenta: number;
    unidadesPorPaquete?: number;
  },
  ctx: z.RefinementCtx,
) => {
  const unidad = tienePrecioUnidad(data);
  const paquete = tienePrecioPaquete(data);

  if (unidad === paquete) {
    return;
  }

  const costoUnidad = paquete
    ? calcularPrecioCompraPorUnidad(
        data.precioCompraPaquete!,
        data.unidadesPorPaquete ?? 1,
      )
    : new Prisma.Decimal(data.precioCompra!);

  if (!new Prisma.Decimal(data.precioVenta).gt(costoUnidad)) {
    ctx.addIssue({
      code: "custom",
      path: ["precioVenta"],
      message: "El precio de venta debe ser mayor al de compra",
    });
  }
};

export const productoBaseSchema = z.object({
  nombre: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(100, "El nombre no puede superar los 100 caracteres"),

  descripcion: z.string().trim().optional(),

  codigoBarras: codigoBarrasSchema.optional(),

  precioCompra: precioCompraSchema.optional(),

  precioCompraPaquete: precioCompraPaqueteSchema.optional(),

  unidadesPorPaquete: unidadesPorPaqueteSchema.optional(),

  precioVenta: z
    .number({ error: "El precio de venta es obligatorio" })
    .positive("El precio de venta debe ser mayor a 0"),

  stock: z
    .number({ error: "El stock es obligatorio" })
    .int("El stock debe ser un número entero")
    .nonnegative("El stock no puede ser negativo"),
  stockMinimo: z.number().int().nonnegative().optional(),
  categoriaId: z.number({ error: "La categoría es obligatoria" }),
});

export const productoSchema = productoBaseSchema.superRefine((data, ctx) =>
  validarCostoProducto(data, ctx),
);

export const updateProductoSchema = productoBaseSchema
  .partial()
  .extend({
    codigoBarras: codigoBarrasSchema.nullable().optional(),
    precioCompraPaquete: precioCompraPaqueteSchema.nullable().optional(),
  })
  .superRefine((data, ctx) =>
    validarCostoProducto(data, ctx, { exigirCosto: false }),
  );

export type CreateProductoInput = z.infer<typeof productoSchema>;
export type UpdateProductoInput = z.infer<typeof updateProductoSchema>;
