import { Request, Response } from "express";
import { ventaService } from "../service/venta.service";

export const ventaController = {

  getAll: async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const resultado = await ventaService.getAll(page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Ventas obtenidas correctamente",
      data: resultado.data,
      meta: resultado.meta,
    });
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