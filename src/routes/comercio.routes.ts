import { Router } from "express";
import { comercioController } from "../controllers/comercio.controller";
import { validate } from "../middlewares/validate";
import { registrarComercioSchema } from "../validators/comercio.validation";

const router = Router();

// Pública con validación estricta: es el bootstrap, ningún token existe aún.
// Protecciones: Zod strict, slug único normalizado, bcrypt, transacción.
// Pendiente (Etapa 0): rate-limit para evitar altas abusivas.
router.post("/registrar", validate(registrarComercioSchema), comercioController.registrar);

export default router;
