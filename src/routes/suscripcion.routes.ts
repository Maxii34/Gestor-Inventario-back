import { Router } from "express";
import { suscripcionController } from "../controllers/suscripcion.controller";
import { verificarToken } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", verificarToken, suscripcionController.getEstado);

export default router;
