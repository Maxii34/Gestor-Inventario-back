import { Router } from "express";
import { plataformaController } from "../controllers/plataforma.controller";
import { validate } from "../middlewares/validate";
import { plataformaLoginLimiter } from "../middlewares/rateLimit";
import { verificarSuperadmin } from "../middlewares/plataforma.middleware";
import {
  cambiarPlanSchema,
  crearComercioPlataformaSchema,
  extenderAccesoSchema,
  loginPlataformaSchema,
  registrarPagoSchema,
  suspenderComercioSchema,
} from "../validators/plataforma.validation";

const router = Router();

router.post(
  "/login",
  plataformaLoginLimiter,
  validate(loginPlataformaSchema),
  plataformaController.login
);

router.get("/comercios", verificarSuperadmin, plataformaController.getComercios);
router.post(
  "/comercios",
  verificarSuperadmin,
  validate(crearComercioPlataformaSchema),
  plataformaController.crearComercio
);
router.get(
  "/comercios/:id",
  verificarSuperadmin,
  plataformaController.getComercioById
);
router.post(
  "/comercios/:id/suspender",
  verificarSuperadmin,
  validate(suspenderComercioSchema),
  plataformaController.suspenderComercio
);
router.post(
  "/comercios/:id/reactivar",
  verificarSuperadmin,
  plataformaController.reactivarComercio
);
router.post(
  "/comercios/:id/extender",
  verificarSuperadmin,
  validate(extenderAccesoSchema),
  plataformaController.extenderAcceso
);
router.post(
  "/comercios/:id/cambiar-plan",
  verificarSuperadmin,
  validate(cambiarPlanSchema),
  plataformaController.cambiarPlan
);
router.post(
  "/comercios/:id/pagos",
  verificarSuperadmin,
  validate(registrarPagoSchema),
  plataformaController.registrarPago
);
router.get(
  "/comercios/:id/pagos",
  verificarSuperadmin,
  plataformaController.getPagos
);

router.get("/auditoria", verificarSuperadmin, plataformaController.getAuditoria);
router.get("/metricas", verificarSuperadmin, plataformaController.getMetricas);

export default router;
