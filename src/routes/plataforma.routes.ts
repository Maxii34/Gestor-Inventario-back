import { Router } from "express";
import { plataformaController } from "../controllers/plataforma.controller";
import { validate } from "../middlewares/validate";
import { plataformaLoginLimiter } from "../middlewares/rateLimit";
import { verificarSuperadmin } from "../middlewares/plataforma.middleware";
import { loginPlataformaSchema } from "../validators/plataforma.validation";

const router = Router();

router.post(
  "/login",
  plataformaLoginLimiter,
  validate(loginPlataformaSchema),
  plataformaController.login
);

router.get("/comercios", verificarSuperadmin, plataformaController.getComercios);
router.get(
  "/comercios/:id",
  verificarSuperadmin,
  plataformaController.getComercioById
);

export default router;
