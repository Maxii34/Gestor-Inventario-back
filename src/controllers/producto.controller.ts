import { Request, Response } from "express";
import { productoService } from "../service/producto.service";

export const productoController = {
  getAll: async (req: Request, res: Response) => {
    const productosObtenidos = await productoService.getAll();
    res.status(200).json({ ok: true, mensaje: "Productos obtenidos", data: productosObtenidos });
  },

  create: async (req: Request, res: Response) => {
    const productoCreado = await productoService.create(req.body);
    res.status(201).json({ ok: true, mensaje: "Producto creado", data: productoCreado }); // corregido 200 -> 201 (creación)
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