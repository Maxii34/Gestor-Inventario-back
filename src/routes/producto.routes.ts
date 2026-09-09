import { Router } from "express";
import { productoController } from "../controllers/producto.controller";
import { validate } from "../middlewares/validate";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";
import { productoSchema, updateProductoSchema } from "../validators/producto.validation";

const router = Router();

router.get("/", verificarToken, productoController.getAll);
router.get("/:id", verificarToken, productoController.getById);
router.post("/", verificarToken, esAdmin, validate(productoSchema), productoController.create);
router.put("/:id", verificarToken, esAdmin, validate(updateProductoSchema), productoController.update);
router.delete("/:id", verificarToken, esAdmin, productoController.delete);

export default router;