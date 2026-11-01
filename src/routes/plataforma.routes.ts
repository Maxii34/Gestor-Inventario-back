import { Router } from "express";
import { plataformaController } from "../controllers/plataforma.controller";
import { validate } from "../middlewares/validate";
import { plataformaLoginLimiter } from "../middlewares/rateLimit";
import { loginPlataformaSchema } from "../validators/plataforma.validation";

const router = Router();

router.post(
  "/login",
  plataformaLoginLimiter,
  validate(loginPlataformaSchema),
  plataformaController.login
);

export default router;
