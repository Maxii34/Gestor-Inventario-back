import { Request, Response } from "express";
import { comercioService } from "../service/comercio.service";
import { ForbiddenError } from "../utils/errors";

export const comercioController = {
  // Alta inicial pública: crea el comercio y su primer ADMIN en una transacción.
  // No requiere token porque ningún usuario existe aún para ese comercio.
  registrar: async (req: Request, res: Response) => {
    if (process.env.REGISTRO_PUBLICO === "false") {
      throw new ForbiddenError("El registro está cerrado");
    }

    const resultado = await comercioService.registrar(req.body);
    res.status(201).json({
      ok: true,
      mensaje: "Comercio registrado correctamente",
      data: resultado,
    });
  },
};
