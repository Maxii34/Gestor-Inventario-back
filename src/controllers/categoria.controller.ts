import { Request, Response } from "express";
import { categoriaService } from "../service/categoria.service";

export const categoriaController = {
  getAll: async (req: Request, res: Response) => {
    const categorias = await categoriaService.getAll();
    res.json(categorias);
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const categoria = await categoriaService.getById(id);
      res.json(categoria);
    } catch (error: any) {
      res.status(404).json({ message: error.message });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const categoria = await categoriaService.create(req.body);
      res.status(201).json(categoria);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const categoria = await categoriaService.update(id, req.body);
      res.json(categoria);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await categoriaService.delete(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  },
};