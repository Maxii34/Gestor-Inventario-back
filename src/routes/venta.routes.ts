import { Router } from "express";
import { ventaController } from "../controllers/venta.controller";
import { validate } from "../middlewares/validate";
import { crearVentaSchema, actualizarVentaSchema } from "../validators/venta.validation";

const router = Router();

router.get("/", ventaController.getAll);
router.get("/:id", ventaController.getById);
router.post("/", validate(crearVentaSchema), ventaController.create);
router.put("/:id", validate(actualizarVentaSchema), ventaController.update);
router.delete("/:id", ventaController.delete);

export default router;