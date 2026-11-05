import { Router } from "express";
import { usuarioController } from "../controllers/usuario.controller";
import { validate } from "../middlewares/validate";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";
import { cambiarPasswordLimiter, loginLimiter } from "../middlewares/rateLimit";
import {
  crearUsuarioSchema,
  loginSchema,
  refreshTokenSchema,
  actualizarUsuarioSchema,
  cambiarPasswordSchema,
} from "../validators/usuario.validation";
 
const router = Router();
 
// Público
router.post("/login", loginLimiter, validate(loginSchema), usuarioController.login);
router.post("/refresh", validate(refreshTokenSchema), usuarioController.refresh);
router.post("/logout", validate(refreshTokenSchema), usuarioController.logout);
router.post(
  "/cambiar-password",
  cambiarPasswordLimiter,
  verificarToken,
  validate(cambiarPasswordSchema),
  usuarioController.cambiarPassword
);
 
// Protegido: solo ADMIN logueado
router.get("/", verificarToken, esAdmin, usuarioController.getAll);
router.get("/:id", verificarToken, esAdmin, usuarioController.getById);
router.post("/", verificarToken, esAdmin, validate(crearUsuarioSchema), usuarioController.create);
router.put("/:id", verificarToken, esAdmin, validate(actualizarUsuarioSchema), usuarioController.update);
router.delete("/:id", verificarToken, esAdmin, usuarioController.delete);
 
export default router;