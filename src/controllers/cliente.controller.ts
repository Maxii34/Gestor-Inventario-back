import { Request, Response } from "express";
import { clienteService } from "../service/cliente.service";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";
import { leerPaginacion } from "../utils/paginacion";

export const clienteController = {

  // Lee page/limit de la query string (ej: GET /clientes?page=2&limit=10).
  // Number(undefined) da NaN, por eso usamos "||" para caer en el valor
  // por defecto si no vino el parámetro o vino mal formado.
  getAll: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query);

    const resultado = await clienteService.getAll(requireComercio(req as AuthRequest), page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Clientes obtenidos correctamente",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const cliente = await clienteService.getById(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Cliente obtenido correctamente", data: cliente });
  },

  create: async (req: Request, res: Response) => {
    const cliente = await clienteService.create(req.body, requireComercio(req as AuthRequest));
    res.status(201).json({ ok: true, mensaje: "Cliente creado correctamente", data: cliente });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const cliente = await clienteService.update(id, requireComercio(req as AuthRequest), req.body);
    res.status(200).json({ ok: true, mensaje: "Cliente actualizado correctamente", data: cliente });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await clienteService.delete(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Cliente eliminado correctamente", data: null });
  },

};
