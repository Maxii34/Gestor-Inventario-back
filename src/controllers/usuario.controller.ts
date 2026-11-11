import { Request, Response } from "express";
import { usuarioService } from "../service/usuario.service";
import { AuthRequest, requireComercio } from "../middlewares/auth.middleware";
import { leerPaginacion } from "../utils/paginacion";

export const usuarioController = {

  getAll: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query, {
      limitePorDefecto: 100,
    });
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const resultado = await usuarioService.getAll(
      requireComercio(req as AuthRequest),
      page,
      limit,
      q
    );
    res.status(200).json({
      ok: true,
      mensaje: "Usuarios obtenidos correctamente",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const usuario = await usuarioService.getById(id, requireComercio(req as AuthRequest));
    res.status(200).json({ ok: true, mensaje: "Usuario obtenido correctamente", data: usuario });
  },

  create: async (req: Request, res: Response) => {
    const usuario = await usuarioService.create(req.body, requireComercio(req as AuthRequest));
    res.status(201).json({ ok: true, mensaje: "Usuario creado correctamente", data: usuario });
  },

  login: async (req: Request, res: Response) => {
    const resultado = await usuarioService.login(req.body);
    res.status(200).json({ ok: true, mensaje: "Login exitoso", data: resultado });
  },

  refresh: async (req: Request, res: Response) => {
    const resultado = await usuarioService.refresh(req.body.refreshToken);
    res.status(200).json({ ok: true, mensaje: "Token renovado correctamente", data: resultado });
  },

  logout: async (req: Request, res: Response) => {
    await usuarioService.logout(req.body.refreshToken);
    res.status(200).json({ ok: true, mensaje: "Sesión cerrada correctamente", data: null });
  },

  cambiarPassword: async (req: Request, res: Response) => {
    const resultado = await usuarioService.cambiarPassword(
      (req as AuthRequest).usuario!.id,
      requireComercio(req as AuthRequest),
      req.body
    );
    res.status(200).json({
      ok: true,
      mensaje: "Contraseña actualizada correctamente",
      data: resultado,
    });
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const usuario = await usuarioService.update(id, requireComercio(req as AuthRequest), req.body);
    res.status(200).json({ ok: true, mensaje: "Usuario actualizado correctamente", data: usuario });
  },

  delete: async (req: Request, res: Response) => {
    const auth = req as AuthRequest;
    const id = Number(req.params.id);
    const resultado = await usuarioService.delete(
      id,
      requireComercio(auth),
      auth.usuario!.id
    );
    res.status(200).json({
      ok: true,
      mensaje:
        resultado.modo === "ELIMINADO"
          ? "Usuario eliminado correctamente"
          : "Usuario dado de baja correctamente",
      data: resultado,
    });
  },

};
