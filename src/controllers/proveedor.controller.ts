import { Request, Response } from "express";
import { proveedorService } from "../service/proveedor.service";
import { requireComercio } from "../middlewares/auth.middleware";
import { BadRequestError } from "../utils/errors";

const parseId = (valor: unknown) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("El id debe ser un número entero positivo");
  }
  return id;
};

export const proveedorController = {
  getAll: async (req: Request, res: Response) => {
    const comercioId = requireComercio(req);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const resultado = await proveedorService.getAll(comercioId, page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Proveedores obtenidos",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getById: async (req: Request, res: Response) => {
    const comercioId = requireComercio(req);
    const proveedor = await proveedorService.getById(parseId(req.params.id), comercioId);
    res.status(200).json({ ok: true, mensaje: "Proveedor obtenido", data: proveedor });
  },

  create: async (req: Request, res: Response) => {
    const comercioId = requireComercio(req);
    const proveedor = await proveedorService.create(req.body, comercioId);
    res.status(201).json({ ok: true, mensaje: "Proveedor creado", data: proveedor });
  },

  update: async (req: Request, res: Response) => {
    const comercioId = requireComercio(req);
    const proveedor = await proveedorService.update(
      parseId(req.params.id),
      comercioId,
      req.body
    );
    res.status(200).json({ ok: true, mensaje: "Proveedor actualizado", data: proveedor });
  },

  delete: async (req: Request, res: Response) => {
    const comercioId = requireComercio(req);
    await proveedorService.delete(parseId(req.params.id), comercioId);
    res.status(200).json({ ok: true, mensaje: "Proveedor eliminado", data: null });
  },
};