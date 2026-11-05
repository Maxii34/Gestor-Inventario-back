import { Request, Response } from "express";
import { plataformaService } from "../service/plataforma.service";
import { leerPaginacion } from "../utils/paginacion";
import { BadRequestError } from "../utils/errors";
import {
  PlataformaRequest,
  requireSuperadmin,
} from "../middlewares/plataforma.middleware";

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

  crearComercio: async (req: Request, res: Response) => {
    const resultado = await plataformaService.crearComercio(
      req.body,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(201).json({
      ok: true,
      mensaje: "Comercio creado",
      data: resultado,
    });
  },

  suspenderComercio: async (req: Request, res: Response) => {
    const comercio = await plataformaService.suspenderComercio(
      parseId(req.params.id),
      req.body.motivo,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(200).json({
      ok: true,
      mensaje: "Comercio suspendido",
      data: comercio,
    });
  },

  reactivarComercio: async (req: Request, res: Response) => {
    const comercio = await plataformaService.reactivarComercio(
      parseId(req.params.id),
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(200).json({
      ok: true,
      mensaje: "Comercio reactivado",
      data: comercio,
    });
  },

  extenderAcceso: async (req: Request, res: Response) => {
    const comercio = await plataformaService.extenderAcceso(
      parseId(req.params.id),
      req.body.dias,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(200).json({
      ok: true,
      mensaje: "Acceso extendido",
      data: comercio,
    });
  },

  cambiarPlan: async (req: Request, res: Response) => {
    const comercio = await plataformaService.cambiarPlan(
      parseId(req.params.id),
      req.body.plan,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(200).json({
      ok: true,
      mensaje: "Plan actualizado",
      data: comercio,
    });
  },

  registrarPago: async (req: Request, res: Response) => {
    const pago = await plataformaService.registrarPago(
      parseId(req.params.id),
      req.body,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(201).json({
      ok: true,
      mensaje: "Pago registrado",
      data: pago,
    });
  },

  getPagos: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query);
    const resultado = await plataformaService.listarPagos(
      parseId(req.params.id),
      page,
      limit
    );
    res.status(200).json({
      ok: true,
      mensaje: "Pagos obtenidos",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getUsuariosComercio: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query);
    const resultado = await plataformaService.listarUsuariosComercio(
      parseId(req.params.id),
      page,
      limit,
      queryString(req.query.q)
    );
    res.status(200).json({
      ok: true,
      mensaje: "Usuarios obtenidos",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  editarUsuarioComercio: async (req: Request, res: Response) => {
    const usuario = await plataformaService.editarUsuarioComercio(
      parseId(req.params.id),
      parseId(req.params.usuarioId),
      req.body,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.status(200).json({
      ok: true,
      mensaje: "Usuario actualizado",
      data: usuario,
    });
  },

  resetearPasswordUsuario: async (req: Request, res: Response) => {
    const resultado = await plataformaService.resetearPasswordUsuario(
      parseId(req.params.id),
      parseId(req.params.usuarioId),
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      mensaje: "Contraseña restablecida",
      data: resultado,
    });
  },

  cargaMasivaCategorias: async (req: Request, res: Response) => {
    const resultado = await plataformaService.cargaMasivaCategorias(
      parseId(req.params.id),
      req.body,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );

    if (!resultado.ok) {
      res.status(400).json({
        ok: false,
        mensaje: "Hay filas con errores: no se cargó nada",
        data: { errores: resultado.errores },
      });
      return;
    }

    if ("simulacion" in resultado) {
      res.status(200).json({
        ok: true,
        mensaje: "Simulación completada",
        data: { validas: resultado.validas, simulacion: true },
      });
      return;
    }

    res.status(201).json({
      ok: true,
      mensaje: "Categorías cargadas",
      data: { creados: resultado.creados },
    });
  },

  cargaMasivaProductos: async (req: Request, res: Response) => {
    const resultado = await plataformaService.cargaMasivaProductos(
      parseId(req.params.id),
      req.body,
      requireSuperadmin(req as PlataformaRequest),
      req.ip ?? null
    );

    if (!resultado.ok) {
      res.status(400).json({
        ok: false,
        mensaje: "Hay filas con errores: no se cargó nada",
        data: { errores: resultado.errores },
      });
      return;
    }

    if ("simulacion" in resultado) {
      res.status(200).json({
        ok: true,
        mensaje: "Simulación completada",
        data: { validas: resultado.validas, simulacion: true },
      });
      return;
    }

    res.status(201).json({
      ok: true,
      mensaje: "Productos cargados",
      data: { creados: resultado.creados },
    });
  },

  getAuditoria: async (req: Request, res: Response) => {
    const { page, limit } = leerPaginacion(req.query);
    const comercioIdCrudo = queryString(req.query.comercioId);
    const resultado = await plataformaService.listarAuditoria({
      comercioId:
        comercioIdCrudo !== undefined ? parseId(comercioIdCrudo) : undefined,
      page,
      limit,
    });
    res.status(200).json({
      ok: true,
      mensaje: "Auditoría obtenida",
      data: resultado.data,
      meta: resultado.meta,
    });
  },

  getMetricas: async (_req: Request, res: Response) => {
    const metricas = await plataformaService.obtenerMetricas();
    res.status(200).json({
      ok: true,
      mensaje: "Métricas obtenidas",
      data: metricas,
    });
  },
};
