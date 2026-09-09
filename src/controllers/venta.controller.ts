import { Request, Response } from "express";
import { ventaService } from "../service/venta.service";

export const ventaController = {

  getAll: async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const resultado = await ventaService.getAll(page, limit);
    res.status(200).json({
      ok: true,
      mensaje: "Ventas obtenidas correctamente",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const venta = await ventaService.getById(id);
    res.status(200).json({ ok: true, mensaje: "Venta obtenida correctamente", data: venta });
  },

  // Ahora inicia el proceso de pago en vez de completar la venta al instante.
  // Devuelve el link de Mercado Pago para que el frontend redirija al cliente.
  create: async (req: Request, res: Response) => {
    const resultado = await ventaService.iniciarVenta(req.body);
    res.status(201).json({
      ok: true,
      mensaje: "Venta iniciada, redirigir al link de pago",
      data: resultado,
    });
  },

  // Nuevo: acá le pega Mercado Pago, no el frontend ni un usuario común.
  // Siempre respondemos 200 rápido (MP reintenta si no le contestás a tiempo),
  // incluso si la notificación no era del tipo que nos interesa.
  webhook: async (req: Request, res: Response) => {
    const { type, data } = req.body;

    if (type === "payment" && data?.id) {
      await ventaService.confirmarPago(data.id);
    }

    res.status(200).send("ok");
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const venta = await ventaService.update(id, req.body);
    res.status(200).json({ ok: true, mensaje: "Venta actualizada correctamente", data: venta });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await ventaService.delete(id);
    res.status(200).json({ ok: true, mensaje: "Venta eliminada correctamente", data: null });
  },

};