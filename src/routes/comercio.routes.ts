import { Router } from "express";
import { comercioController } from "../controllers/comercio.controller";
import { validate } from "../middlewares/validate";
import { registroLimiter } from "../middlewares/rateLimit";
import { registrarComercioSchema } from "../validators/comercio.validation";

const router = Router();

// Pública con validación estricta: es el bootstrap, ningún token existe aún.
// Protecciones: rate limit por IP, Zod strict, slug único normalizado,
// bcrypt, transacción.
router.post(
  "/registrar",
  registroLimiter,
  validate(registrarComercioSchema),
  comercioController.registrar
);

export default router;