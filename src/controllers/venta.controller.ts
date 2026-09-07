import { Request, Response } from "express";
import { ventaService } from "../service/venta.service";

export const ventaController = {

  getAll: async (req: Request, res: Response) => {
    try {
      const ventas = await ventaService.getAll();
      res.status(200).json({ ok: true, mensaje: "Ventas obtenidas correctamente", data: ventas });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const venta = await ventaService.getById(id);
      res.status(200).json({ ok: true, mensaje: "Venta obtenida correctamente", data: venta });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const venta = await ventaService.create(req.body);
      res.status(201).json({ ok: true, mensaje: "Venta creada correctamente", data: venta });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const venta = await ventaService.update(id, req.body);
      res.status(200).json({ ok: true, mensaje: "Venta actualizada correctamente", data: venta });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await ventaService.delete(id);
      res.status(200).json({ ok: true, mensaje: "Venta eliminada correctamente", data: null });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

};