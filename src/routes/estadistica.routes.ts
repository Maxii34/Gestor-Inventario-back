import { Router } from "express";
import { estadisticaController } from "../controllers/estadistica.controller";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.get("/recaudacion", verificarToken, estadisticaController.getRecaudacion);
router.get("/vendedores", verificarToken, esAdmin, estadisticaController.getVendedores);

export default router;