import { Router } from "express";
import { categoriaController } from "../controllers/categoria.controller";
import { categoriaValidate } from "../middlewares/categoria.validate";
import { categoriaSchema, updateCategoriaSchema } from "../validators/categoria.validation";

const router = Router();

router.get("/", categoriaController.getAll);
router.get("/:id", categoriaController.getById);
router.post("/", categoriaValidate(categoriaSchema), categoriaController.create);
router.put("/:id", categoriaValidate(updateCategoriaSchema), categoriaController.update);
router.delete("/:id", categoriaController.delete);

export default router;