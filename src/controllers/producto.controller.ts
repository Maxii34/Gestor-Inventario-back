import { Request, Response } from "express";
import { productoService } from "../service/producto.service";

export const productoController = {
    getAll: async (req: Request, res: Response) => {
      try {
        const productosObtenidos = await productoService.getAll();
        res.status(200).json({ ok: true, mensaje: "Productos obtenidos", data: productosObtenidos });
      } catch (error: any) {
        res.status(400).json({ ok: false, mensaje: error.message });
      }
    },

    create: async (req: Request, res: Response) => {
      try {
        const productoCreado = await productoService.create(req.body);
        res.status(200).json({ ok: true, mensaje: "Producto creado", data: productoCreado });
      } catch (error: any) {
        res.status(400).json({ ok: false, mensaje: error.message });
      }
    },
    
    getById: async (req: Request, res: Response) => {
      try {
        const productoObtenido = await productoService.getById(Number(req.params.id));
        res.status(200).json({ ok: true, mensaje: "producto obtenido", data: productoObtenido  });
      } catch (error: any) {
        res.status(400).json({ ok: false, mensaje: error.message });
      }
    },
    
    update: async (req: Request, res: Response) => {
      try {
        const productoActualizado = await productoService.update(Number(req.params.id), req.body);
        res.status(200).json({ ok: true, mensaje: "Producto actualizado", data: productoActualizado });
      } catch (error: any) {
        res.status(400).json({ ok: false, mensaje: error.message });
      }
    },
    
    delete: async (req: Request, res: Response) => {
      try {
        const productoEliminado = await productoService.delete(Number(req.params.id));
        res.status(200).json({ ok: true, mensaje: "Producto eliminado", data: productoEliminado });
      } catch (error: any) {
        res.status(400).json({ ok: false, mensaje: error.message });
      }
    },
    
};