import { Request, Response } from "express";
import { usuarioService } from "../service/usuario.service";

export const usuarioController = {

  getAll: async (req: Request, res: Response) => {
    try {
      const usuarios = await usuarioService.getAll();
      res.status(200).json({ ok: true, mensaje: "Usuarios obtenidos correctamente", data: usuarios });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const usuario = await usuarioService.getById(id);
      res.status(200).json({ ok: true, mensaje: "Usuario obtenido correctamente", data: usuario });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const usuario = await usuarioService.create(req.body);
      res.status(201).json({ ok: true, mensaje: "Usuario creado correctamente", data: usuario });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      const resultado = await usuarioService.login(req.body);
      res.status(200).json({ ok: true, mensaje: "Login exitoso", data: resultado });
    } catch (error: any) {
      res.status(401).json({ ok: false, mensaje: error.message });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const usuario = await usuarioService.update(id, req.body);
      res.status(200).json({ ok: true, mensaje: "Usuario actualizado correctamente", data: usuario });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await usuarioService.delete(id);
      res.status(200).json({ ok: true, mensaje: "Usuario eliminado correctamente", data: null });
    } catch (error: any) {
      res.status(400).json({ ok: false, mensaje: error.message });
    }
  },

};