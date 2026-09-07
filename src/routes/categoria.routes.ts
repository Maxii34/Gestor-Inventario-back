import { Router } from "express";
import { categoriaController } from "../controllers/categoria.controller";
import { validate } from "../middlewares/validate";
import { categoriaSchema, updateCategoriaSchema } from "../validators/categoria.validation";

const router = Router();

router.get("/", categoriaController.getAll);
router.get("/:id", categoriaController.getById);
router.post("/", validate(categoriaSchema), categoriaController.create);
router.put("/:id", validate(updateCategoriaSchema), categoriaController.update);
router.delete("/:id", categoriaController.delete);

export default router;