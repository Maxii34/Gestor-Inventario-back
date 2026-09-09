import { Request, Response } from "express";
import { usuarioService } from "../service/usuario.service";

export const usuarioController = {

  getAll: async (req: Request, res: Response) => {
    const usuarios = await usuarioService.getAll();
    res.status(200).json({ ok: true, mensaje: "Usuarios obtenidos correctamente", data: usuarios });
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const usuario = await usuarioService.getById(id);
    res.status(200).json({ ok: true, mensaje: "Usuario obtenido correctamente", data: usuario });
  },

  create: async (req: Request, res: Response) => {
    const usuario = await usuarioService.create(req.body);
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

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const usuario = await usuarioService.update(id, req.body);
    res.status(200).json({ ok: true, mensaje: "Usuario actualizado correctamente", data: usuario });
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await usuarioService.delete(id);
    res.status(200).json({ ok: true, mensaje: "Usuario eliminado correctamente", data: null });
  },

};