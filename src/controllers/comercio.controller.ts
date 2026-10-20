import { Request, Response } from "express";
import { comercioService } from "../service/comercio.service";

export const comercioController = {
  // Alta inicial pública: crea el comercio y su primer ADMIN en una transacción.
  // No requiere token porque ningún usuario existe aún para ese comercio.
  registrar: async (req: Request, res: Response) => {
    const resultado = await comercioService.registrar(req.body);
    res.status(201).json({
      ok: true,
      mensaje: "Comercio registrado correctamente",
      data: resultado,
    });
  },
};
