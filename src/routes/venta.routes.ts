import { Router } from "express";
import { ventaController } from "../controllers/venta.controller";
import { validate } from "../middlewares/validate";
import { verificarToken } from "../middlewares/auth.middleware";
import { crearVentaSchema, actualizarVentaSchema } from "../validators/venta.validation";

const router = Router();

router.get("/", verificarToken, ventaController.getAll);
router.get("/:id", verificarToken, ventaController.getById);
router.post("/", verificarToken, validate(crearVentaSchema), ventaController.create);
router.put("/:id", verificarToken, validate(actualizarVentaSchema), ventaController.update);
router.delete("/:id", verificarToken, ventaController.delete);

export default router;