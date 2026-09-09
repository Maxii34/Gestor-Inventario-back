import { Router } from "express";
import { categoriaController } from "../controllers/categoria.controller";
import { validate } from "../middlewares/validate";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";
import { categoriaSchema, updateCategoriaSchema } from "../validators/categoria.validation";

const router = Router();

router.get("/",verificarToken, categoriaController.getAll);
router.get("/:id",verificarToken, categoriaController.getById);
router.post("/", verificarToken, esAdmin, validate(categoriaSchema), categoriaController.create);
router.put("/:id", verificarToken, esAdmin, validate(updateCategoriaSchema), categoriaController.update);
router.delete("/:id", verificarToken, esAdmin, categoriaController.delete);

export default router;