import { Request, Response } from "express";
import { clienteService } from "../service/cliente.service";

export const clienteController = {

  getAll: async (req: Request, res: Response) => {
    try {
      const clientes = await clienteService.getAll();
      res.status(200).json({ ok: true, mensaje: "Clientes obtenidos correctamente", data: clientes });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cliente = await clienteService.getById(id);
      res.status(200).json({ ok: true, mensaje: "Cliente obtenido correctamente", data: cliente });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const cliente = await clienteService.create(req.body);
      res.status(201).json({ ok: true, mensaje: "Cliente creado correctamente", data: cliente });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cliente = await clienteService.update(id, req.body);
      res.status(200).json({ ok: true, mensaje: "Cliente actualizado correctamente", data: cliente });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await clienteService.delete(id);
      res.status(200).json({ ok: true, mensaje: "Cliente eliminado correctamente", data: null });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

};