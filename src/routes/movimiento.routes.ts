import { Router } from "express";
import { movimientoController } from "../controllers/movimiento.controller";
import { validate } from "../middlewares/validate";
import { verificarToken } from "../middlewares/auth.middleware";
import { crearMovimientoSchema, actualizarMovimientoSchema } from "../validators/movimiento.validation";

const router = Router();

router.get("/",verificarToken, movimientoController.getAll);
router.get("/:id",verificarToken, movimientoController.getById);
router.post("/",verificarToken, validate(crearMovimientoSchema), movimientoController.create);
router.put("/:id",verificarToken, validate(actualizarMovimientoSchema), movimientoController.update);
router.delete("/:id",verificarToken, movimientoController.delete);

export default router;