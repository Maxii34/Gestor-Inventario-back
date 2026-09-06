import { Router } from "express";
import { categoriaController } from "../controllers/categoria.controller";

const router = Router();

router.get("/", categoriaController.getAll);
router.get("/:id", categoriaController.getById);
router.post("/", categoriaController.create);
router.put("/:id", categoriaController.update);
router.delete("/:id", categoriaController.delete);

export default router;