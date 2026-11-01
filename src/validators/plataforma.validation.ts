import { z } from "zod";

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

export type LoginPlataformaInput = z.infer<typeof loginPlataformaSchema>;
