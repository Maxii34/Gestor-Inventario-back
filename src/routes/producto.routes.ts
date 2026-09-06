import { Router } from "express";
import { productoController } from "../controllers/producto.controller";
import { validate } from "../middlewares/categoria.validate";
import { productoSchema, updateProductoSchema } from "../validators/producto.validation";

const router = Router();

// Define your routes here
router.get("/", productoController.getAll);
router.get("/:id", productoController.getById);
router.post("/", validate(productoSchema), productoController.create);
router.put("/:id", validate(updateProductoSchema), productoController.update);
router.delete("/:id", productoController.delete);

export default router;