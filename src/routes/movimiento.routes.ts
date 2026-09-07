import { Router } from "express";
import { movimientoController } from "../controllers/movimiento.controller";
import { validate } from "../middlewares/validate";
import { crearMovimientoSchema, actualizarMovimientoSchema } from "../validators/movimiento.validation";

const router = Router();

router.get("/", movimientoController.getAll);
router.get("/:id", movimientoController.getById);
router.post("/", validate(crearMovimientoSchema), movimientoController.create);
router.put("/:id", validate(actualizarMovimientoSchema), movimientoController.update);
router.delete("/:id", movimientoController.delete);

export default router;