import { Request, Response } from "express";
import { categoriaService } from "../service/categoria.service";

export const categoriaController = {
  getAll: async (req: Request, res: Response) => {
    try {
      const categorias = await categoriaService.getAll();
      res.status(200).json({ ok: true, mensaje: "Categorías obtenidas", data: categorias });
    } catch (error: any) {
      res.status(500).json({ ok: false, mensaje: error.message });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const categoria = await categoriaService.getById(id);
      res.status(200).json({ ok: true, mensaje: "Categoría encontrada", data: categoria });
    } catch (error: any) {
      res.status(404).json({ ok: false, mensaje: error.message });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const categoria = await categoriaService.create(req.body);
      res.status(201).json({ ok: true, mensaje: "Categoría creada", data: categoria });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const categoria = await categoriaService.update(id, req.body);
      res.status(200).json({ ok: true, mensaje: "Categoría actualizada", data: categoria });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await categoriaService.delete(id);
      res.status(200).json({ ok: true, mensaje: "Categoría eliminada" });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },
};