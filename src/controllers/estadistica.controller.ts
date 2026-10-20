import { Request, Response } from "express";
import { estadisticaService } from "../service/estadistica.service";
import { BadRequestError } from "../utils/errors";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";

export const estadisticaController = {
  getRecaudacion: async (req: Request, res: Response) => {
    const { desde, hasta } = req.query;

    if (!desde || !hasta || typeof desde !== "string" || typeof hasta !== "string") {
      throw new BadRequestError("Los parámetros 'desde' y 'hasta' son obligatorios");
    }

    const resultado = await estadisticaService.getRecaudacion(requireComercio(req as AuthRequest), { desde, hasta });
    res.status(200).json({ ok: true, mensaje: "Recaudación obtenida correctamente", data: resultado });
  },
};
