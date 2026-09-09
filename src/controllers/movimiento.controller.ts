import { Request, Response } from "express";
import { movimientoService } from "../service/movimiento.service";

export const movimientoController = {

  getAll: async (req: Request, res: Response) => {
    const movimientos = await movimientoService.getAll();
    res.status(200).json({ ok: true, mensaje: "Movimientos obtenidos correctamente", data: movimientos });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const movimiento = await movimientoService.getById(id);
    res.status(200).json({ ok: true, mensaje: "Movimiento obtenido correctamente", data: movimiento });
  },

  create: async (req: Request, res: Response) => {
    const movimiento = await movimientoService.create(req.body);
    res.status(201).json({ ok: true, mensaje: "Movimiento creado correctamente", data: movimiento });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const movimiento = await movimientoService.update(id, req.body);
    res.status(200).json({ ok: true, mensaje: "Movimiento actualizado correctamente", data: movimiento });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await movimientoService.delete(id);
    res.status(200).json({ ok: true, mensaje: "Movimiento eliminado correctamente", data: null });
  },

};