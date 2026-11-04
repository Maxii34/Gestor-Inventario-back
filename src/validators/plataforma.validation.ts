import { z } from "zod";
import { categoriaSchema } from "./categoria.validation";
import { productoSchema } from "./producto.validation";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("El email no es válido"));

export const loginPlataformaSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "La contraseña es obligatoria").max(200),
  })
  .strict();

const passwordComercioSchema = z
  .string()
  .refine((p) => Buffer.byteLength(p, "utf8") >= 6, {
    message: "La contraseña debe tener al menos 6 bytes",
  })
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, {
    message: "La contraseña es demasiado larga (máximo 72 bytes)",
  });

const diasSchema = z.number().int().min(1).max(365);

export const crearComercioPlataformaSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre del comercio es obligatorio").max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/, "El identificador solo admite minúsculas, números y guiones")
      .max(80)
      .optional(),
    adminNombre: z
      .string()
      .trim()
      .min(1, "El nombre del administrador es obligatorio")
      .max(120),
    adminEmail: emailSchema,
    adminPassword: passwordComercioSchema,
    dias: diasSchema.optional(),
  })
  .strict();

export const suspenderComercioSchema = z
  .object({
    motivo: z
      .string()
      .trim()
      .min(1, "El motivo de la suspensión es obligatorio")
      .max(500),
  })
  .strict();

export const extenderAccesoSchema = z
  .object({
    dias: diasSchema,
  })
  .strict();

export const cambiarPlanSchema = z
  .object({
    plan: z.enum(["PRUEBA", "MENSUAL", "TRIMESTRAL"]),
  })
  .strict();

export const categoriaMasivaFilaSchema = categoriaSchema
  .pick({ nombre: true, descripcion: true })
  .strict();

export const productoMasivaFilaSchema = productoSchema
  .omit({ categoriaId: true })
  .extend({
    categoria: z
      .string({ error: "La categoría es obligatoria" })
      .trim()
      .min(1, "La categoría es obligatoria")
      .max(100, "La categoría no puede superar los 100 caracteres"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.precioVenta <= data.precioCompra) {
      ctx.addIssue({
        code: "custom",
        path: ["precioVenta"],
        message: "El precio de venta debe ser mayor al de compra",
      });
    }
  });

const cargaMasivaBase = {
  simular: z.boolean().optional(),
};

export const cargaMasivaCategoriasSchema = z
  .object({
    categorias: z
      .array(z.unknown())
      .min(1, "Debés enviar al menos una categoría")
      .max(50, "No se pueden cargar más de 50 categorías por pedido"),
    ...cargaMasivaBase,
  })
  .strict();

export const cargaMasivaProductosSchema = z
  .object({
    productos: z
      .array(z.unknown())
      .min(1, "Debés enviar al menos un producto")
      .max(50, "No se pueden cargar más de 50 productos por pedido"),
    ...cargaMasivaBase,
  })
  .strict();

export const editarUsuarioPlataformaSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120).optional(),
    email: emailSchema.optional(),
    rol: z.enum(["ADMIN", "VENDEDOR"]).optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "Enviá al menos un campo para actualizar",
  });

export const registrarPagoSchema = z
  .object({
    plan: z.enum(["MENSUAL", "TRIMESTRAL"], {
      error: "El plan PRUEBA no es pagable",
    }),
    meses: z.number().int().min(1).max(24),
    monto: z.number().positive("El monto debe ser mayor a 0"),
    metodo: z.enum(["TRANSFERENCIA", "EFECTIVO", "OTRO"]),
    referencia: z.string().trim().max(200).optional(),
    nota: z.string().trim().max(1000).optional(),
  })
  .strict();

export type LoginPlataformaInput = z.infer<typeof loginPlataformaSchema>;
export type CrearComercioPlataformaInput = z.infer<typeof crearComercioPlataformaSchema>;
export type SuspenderComercioInput = z.infer<typeof suspenderComercioSchema>;
export type ExtenderAccesoInput = z.infer<typeof extenderAccesoSchema>;
export type CambiarPlanInput = z.infer<typeof cambiarPlanSchema>;
export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;
export type EditarUsuarioPlataformaInput = z.infer<typeof editarUsuarioPlataformaSchema>;
export type CargaMasivaCategoriasInput = z.infer<typeof cargaMasivaCategoriasSchema>;
export type CargaMasivaProductosInput = z.infer<typeof cargaMasivaProductosSchema>;
export type CategoriaMasivaFilaInput = z.infer<typeof categoriaMasivaFilaSchema>;
export type ProductoMasivaFilaInput = z.infer<typeof productoMasivaFilaSchema>;
