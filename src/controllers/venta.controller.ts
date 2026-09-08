import { Request, Response } from "express";
import { ventaService } from "../service/venta.service";

export const ventaController = {

  getAll: async (req: Request, res: Response) => {
    const ventas = await ventaService.getAll();
    res.status(200).json({ ok: true, mensaje: "Ventas obtenidas correctamente", data: ventas });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const venta = await ventaService.getById(id);
    res.status(200).json({ ok: true, mensaje: "Venta obtenida correctamente", data: venta });
  },

  create: async (req: Request, res: Response) => {
    const venta = await ventaService.create(req.body);
    res.status(201).json({ ok: true, mensaje: "Venta creada correctamente", data: venta });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const venta = await ventaService.update(id, req.body);
    res.status(200).json({ ok: true, mensaje: "Venta actualizada correctamente", data: venta });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await ventaService.delete(id);
    res.status(200).json({ ok: true, mensaje: "Venta eliminada correctamente", data: null });
  },

};