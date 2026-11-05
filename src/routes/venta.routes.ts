import { Router } from "express";
import { ventaController } from "../controllers/venta.controller";
import { validate } from "../middlewares/validate";
import { verificarToken, esAdmin } from "../middlewares/auth.middleware";
import { crearVentaSchema, actualizarVentaSchema, anularVentaSchema } from "../validators/venta.validation";

const router = Router();

router.get("/", verificarToken, ventaController.getAll);
router.get("/:id", verificarToken, ventaController.getById);
router.post("/", verificarToken, validate(crearVentaSchema), ventaController.create);

router.put("/:id", verificarToken, esAdmin, validate(actualizarVentaSchema), ventaController.update);
// Borrado físico prohibido al servicio: este endpoint siempre responde 409.
// La vía de egreso es POST /:id/anular.
router.delete("/:id", verificarToken, esAdmin, ventaController.delete);

// Anulación explícita con motivo obligatorio (ADMIN). PENDIENTE → ANULADA directo;
// COMPLETADA → ANULADA con reposición de stock en transacción.
router.post("/:id/anular", verificarToken, esAdmin, validate(anularVentaSchema), ventaController.anular);

export default router;