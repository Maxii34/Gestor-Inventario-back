import { Request, Response } from "express";
import { plataformaService } from "../service/plataforma.service";

export const plataformaController = {
  login: async (req: Request, res: Response) => {
    const resultado = await plataformaService.login(req.body);
    res.status(200).json({
      ok: true,
      mensaje: "Login exitoso",
      data: resultado,
    });
  },
};
