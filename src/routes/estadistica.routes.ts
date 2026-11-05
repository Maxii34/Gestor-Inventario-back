import { Router } from "express";
import { estadisticaController } from "../controllers/estadistica.controller";
import { verificarToken } from "../middlewares/auth.middleware";

const router = Router();

router.get("/recaudacion", verificarToken, estadisticaController.getRecaudacion);

export default router;