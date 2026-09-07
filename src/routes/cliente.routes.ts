import { Router } from "express";
import { clienteController } from "../controllers/cliente.controller";
import { validate } from "../middlewares/validate";
import {
  crearClienteSchema,
  actualizarClienteSchema,
} from "../validators/cliente.validate";

const router = Router();

router.get("/", clienteController.getAll);
router.get("/:id", clienteController.getById);
router.post("/", validate(crearClienteSchema), clienteController.create);
router.put("/:id", validate(actualizarClienteSchema), clienteController.update);
router.delete("/:id", clienteController.delete);

export default router;