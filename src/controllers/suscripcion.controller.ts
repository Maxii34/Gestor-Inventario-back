import { Request, Response } from "express";
import { suscripcionService } from "../service/suscripcion.service";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";

export const suscripcionController = {
  getEstado: async (req: Request, res: Response) => {
    const data = await suscripcionService.obtenerEstado(
      requireComercio(req as AuthRequest)
    );
    res.status(200).json({
      ok: true,
      mensaje: "Estado de suscripción obtenido",
      data,
    });
  },
};
