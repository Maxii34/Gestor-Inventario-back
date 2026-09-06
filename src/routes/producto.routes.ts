import { Router } from "express";
import { productoController } from "../controllers/producto.controller";

const router = Router();

// Define your routes here
router.get("/", productoController.getAll);
router.get("/:id", productoController.getById);
router.post("/", productoController.create);
router.put("/:id", productoController.update);
router.delete("/:id", productoController.delete);

export default router;