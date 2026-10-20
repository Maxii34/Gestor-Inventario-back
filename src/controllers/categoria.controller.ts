import { Request, Response } from "express";
import { categoriaService } from "../service/categoria.service";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";

// Ya no hay try/catch: Express 5 detecta el error lanzado dentro del async
// automáticamente y lo manda directo al errorHandler central (app.ts).
export const categoriaController = {
  getAll: async (req: Request, res: Response) => {
    const categorias = await categoriaService.getAll(requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Categorías obtenidas", data: categorias });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const categoria = await categoriaService.getById(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Categoría encontrada", data: categoria });
  },

  create: async (req: Request, res: Response) => {
    const categoria = await categoriaService.create(req.body, requireComercio(req as AuthRequest));
    res.status(201).json({ ok: true, mensaje: "Categoría creada", data: categoria });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const categoria = await categoriaService.update(id, requireComercio(req as AuthRequest), req.body);
    res.status(200).json({ ok: true, mensaje: "Categoría actualizada", data: categoria });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await categoriaService.delete(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Categoría eliminada" });
  },
};
