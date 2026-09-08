import { Router } from "express";
import { clienteController } from "../controllers/cliente.controller";
import { validate } from "../middlewares/validate";
import { verificarToken } from "../middlewares/auth.middleware";
import { crearClienteSchema, actualizarClienteSchema } from "../validators/cliente.validate";

const router = Router();

router.get("/", verificarToken, clienteController.getAll);
router.get("/:id", verificarToken, clienteController.getById);
router.post("/",verificarToken, validate(crearClienteSchema), clienteController.create);
router.put("/:id",verificarToken, validate(actualizarClienteSchema), clienteController.update);
router.delete("/:id",verificarToken, clienteController.delete);

export default router;