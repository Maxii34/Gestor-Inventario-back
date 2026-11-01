import { Request, Response } from "express";
import { plataformaService } from "../service/plataforma.service";
import { leerPaginacion } from "../utils/paginacion";
import { BadRequestError } from "../utils/errors";

export const parseId = (valor: unknown) => {
  if (typeof valor !== "string") {
    throw new BadRequestError("Identificador inválido");
  }
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("Identificador inválido");
  }
  return id;
};

const queryString = (valor: unknown) =>
  typeof valor === "string" ? valor : undefined;

export const plataformaController = {
  login: async (req: Request, res: Response) => {
    const resultado = await plataformaService.login(req.body);
    res.status(200).json({
      ok: true,
      mensaje: "Login exitoso",
      data: resultado,
    });
  },

  getComercios: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query);
    const resultado = await plataformaService.listarComercios({
      page,
      limit,
      estado: queryString(req.query.estado),
      q: queryString(req.query.q),
    });

    res.status(200).json({
      ok: true,
      mensaje: "Comercios obtenidos",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getComercioById: async (req: Request, res: Response) => {
    const comercio = await plataformaService.obtenerComercio(
      parseId(req.params.id)
    );
    res.status(200).json({
      ok: true,
      mensaje: "Comercio obtenido",
      data: comercio,
    });
  },
};
