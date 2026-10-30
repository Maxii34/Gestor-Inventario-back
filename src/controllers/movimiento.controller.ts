import { Request, Response } from "express";
import { movimientoService } from "../service/movimiento.service";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";
import { leerPaginacion } from "../utils/paginacion";

export const movimientoController = {

  getAll: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query);

    const resultado = await movimientoService.getAll(requireComercio(req as AuthRequest), page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Movimientos obtenidos correctamente",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const movimiento = await movimientoService.getById(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Movimiento obtenido correctamente", data: movimiento });
  },

  create: async (req: Request, res: Response) => {
    const auth = req as AuthRequest;
    const movimiento = await movimientoService.create(req.body, requireComercio(auth), auth.usuario?.id);
    res.status(201).json({ ok: true, mensaje: "Movimiento creado correctamente", data: movimiento });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const movimiento = await movimientoService.update(id, requireComercio(req as AuthRequest), req.body);
    res.status(200).json({ ok: true, mensaje: "Movimiento actualizado correctamente", data: movimiento });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await movimientoService.delete(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Movimiento eliminado correctamente", data: null });
  },

};
