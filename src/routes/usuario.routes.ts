import { Router } from "express";
import { usuarioController } from "../controllers/usuario.controller";
import { validate } from "../middlewares/validate";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";
import {
  crearUsuarioSchema,
  loginSchema,
  refreshTokenSchema,
  actualizarUsuarioSchema,
} from "../validators/usuario.validation";

const router = Router();

// Público
router.post("/login", validate(loginSchema), usuarioController.login);
router.post("/refresh", validate(refreshTokenSchema), usuarioController.refresh);
router.post("/logout", validate(refreshTokenSchema), usuarioController.logout);

// Protegido: solo ADMIN logueado
router.get("/", verificarToken, esAdmin, usuarioController.getAll);
router.get("/:id", verificarToken, esAdmin, usuarioController.getById);
router.post("/", validate(crearUsuarioSchema), usuarioController.create);
router.put("/:id", verificarToken, esAdmin, validate(actualizarUsuarioSchema), usuarioController.update);
router.delete("/:id", verificarToken, esAdmin, usuarioController.delete);

export default router;