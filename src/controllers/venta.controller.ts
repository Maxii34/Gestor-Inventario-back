import { Request, Response } from "express";
import { ventaService } from "../service/venta.service";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";

export const ventaController = {

  getAll: async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const resultado = await ventaService.getAll(requireComercio(req as AuthRequest), page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Ventas obtenidas correctamente",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const venta = await ventaService.getById(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Venta obtenida correctamente", data: venta });
  },

  // Registra la venta directa y completa al instante. El método de pago solo
  // se guarda; el sistema no procesa pagos.
  // El vendedor queda registrado como autor desde el token (nunca del body).
  create: async (req: Request, res: Response) => {
    const auth = req as AuthRequest;
    const resultado = await ventaService.iniciarVenta(req.body, requireComercio(auth), auth.usuario!.id);
    res.status(201).json({
      ok: true,
      mensaje: "Venta registrada correctamente",
      data: resultado,
    });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const venta = await ventaService.update(id, requireComercio(req as AuthRequest), req.body);
    res.status(200).json({ ok: true, mensaje: "Venta actualizada correctamente", data: venta });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await ventaService.delete(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Venta eliminada correctamente", data: null });
  },

  anular: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const auth = req as AuthRequest;
    const venta = await ventaService.anular(id, requireComercio(auth), req.body.motivo, auth.usuario!.id);
    res.status(200).json({ ok: true, mensaje: "Venta anulada correctamente", data: venta });
  },

};
