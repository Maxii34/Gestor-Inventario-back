import { Router } from "express";
import { proveedorController } from "../controllers/proveedor.controller";
import { validate } from "../middlewares/validate";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";
import {
  crearProveedorSchema,
  actualizarProveedorSchema,
} from "../validators/proveedor.validation";

const router = Router();

router.get("/", verificarToken, esAdmin, proveedorController.getAll);
router.get("/:id", verificarToken, esAdmin, proveedorController.getById);
router.post("/", verificarToken, esAdmin, validate(crearProveedorSchema), proveedorController.create);
router.put("/:id", verificarToken, esAdmin, validate(actualizarProveedorSchema), proveedorController.update);
router.delete("/:id", verificarToken, esAdmin, proveedorController.delete);

export default router;
