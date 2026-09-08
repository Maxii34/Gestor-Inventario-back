import { Request, Response } from "express";
import { clienteService } from "../service/cliente.service";

export const clienteController = {

  getAll: async (req: Request, res: Response) => {
    const clientes = await clienteService.getAll();
    res.status(200).json({ ok: true, mensaje: "Clientes obtenidos correctamente", data: clientes });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const cliente = await clienteService.getById(id);
    res.status(200).json({ ok: true, mensaje: "Cliente obtenido correctamente", data: cliente });
  },

  create: async (req: Request, res: Response) => {
    const cliente = await clienteService.create(req.body);
    res.status(201).json({ ok: true, mensaje: "Cliente creado correctamente", data: cliente });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const cliente = await clienteService.update(id, req.body);
    res.status(200).json({ ok: true, mensaje: "Cliente actualizado correctamente", data: cliente });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await clienteService.delete(id);
    res.status(200).json({ ok: true, mensaje: "Cliente eliminado correctamente", data: null });
  },

};