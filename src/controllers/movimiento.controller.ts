import { Request, Response } from "express";
import { movimientoService } from "../service/movimiento.service";

export const movimientoController = {

  getAll: async (req: Request, res: Response) => {
    try {
      const movimientos = await movimientoService.getAll();
      res.status(200).json({ ok: true, mensaje: "Movimientos obtenidos correctamente", data: movimientos });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const movimiento = await movimientoService.getById(id);
      res.status(200).json({ ok: true, mensaje: "Movimiento obtenido correctamente", data: movimiento });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const movimiento = await movimientoService.create(req.body);
      res.status(201).json({ ok: true, mensaje: "Movimiento creado correctamente", data: movimiento });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const movimiento = await movimientoService.update(id, req.body);
      res.status(200).json({ ok: true, mensaje: "Movimiento actualizado correctamente", data: movimiento });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await movimientoService.delete(id);
      res.status(200).json({ ok: true, mensaje: "Movimiento eliminado correctamente", data: null });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

};