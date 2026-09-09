import { Request, Response } from "express";
import { productoService } from "../service/producto.service";

export const productoController = {
  getAll: async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const resultado = await productoService.getAll(page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Productos obtenidos",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  create: async (req: Request, res: Response) => {
    const productoCreado = await productoService.create(req.body);
    res.status(201).json({ ok: true, mensaje: "Producto creado", data: productoCreado });
  },

  getById: async (req: Request, res: Response) => {
    const productoObtenido = await productoService.getById(Number(req.params.id));
    res.status(200).json({ ok: true, mensaje: "Producto obtenido", data: productoObtenido });
  },

  update: async (req: Request, res: Response) => {
    const productoActualizado = await productoService.update(Number(req.params.id), req.body);
    res.status(200).json({ ok: true, mensaje: "Producto actualizado", data: productoActualizado });
  },

  delete: async (req: Request, res: Response) => {
    const productoEliminado = await productoService.delete(Number(req.params.id));
    res.status(200).json({ ok: true, mensaje: "Producto eliminado", data: productoEliminado });
  },
};