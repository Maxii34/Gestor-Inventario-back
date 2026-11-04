import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import {
  AccionPlataforma,
  MetodoCobro,
  Plan,
  Prisma,
  RolUsuario,
} from "../generated/prisma/client";
import { superadminRepository } from "../repositores/superadmin.repository";
import { plataformaRepository } from "../repositores/plataforma.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { productoRepository } from "../repositores/producto.repository";
import {
  categoriaMasivaFilaSchema,
  CategoriaMasivaFilaInput,
  productoMasivaFilaSchema,
  ProductoMasivaFilaInput,
} from "../validators/plataforma.validation";
import { comercioService } from "./comercio.service";
import {
  calcularNuevoAcceso,
  DIAS_PRUEBA,
  estadoSuscripcion,
  EstadoSuscripcion,
} from "../utils/suscripcion";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors";
import { obtenerSecretoPlataforma } from "../utils/plataformaJwt";
import { invalidarVigencia } from "../middlewares/vigencia.middleware";

export interface LoginPlataformaDTO {
  email: string;
  password: string;
}

export interface ListarComerciosDTO {
  page: number;
  limit: number;
  estado?: string;
  q?: string;
}

export interface CrearComercioPlataformaDTO {
  nombre: string;
  slug?: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
  dias?: number;
}

export interface RegistrarPagoDTO {
  plan: "MENSUAL" | "TRIMESTRAL";
  meses: number;
  monto: number;
  metodo: MetodoCobro;
  referencia?: string;
  nota?: string;
}

interface ComercioConConteos {
  id: number;
  nombre: string;
  slug: string;
  activo: boolean;
  plan: Plan;
  accesoHasta: Date | null;
  motivoSuspension: string | null;
  ultimoLogin: Date | null;
  fechaCreacion: Date;
  _count: { usuarios: number; productos: number; ventas: number };
}

const DURACION_TOKEN_PLATAFORMA = "2h";
const ESTADOS_SUSCRIPCION: EstadoSuscripcion[] = [
  "SUSPENDIDO",
  "SIN_VENCIMIENTO",
  "VIGENTE",
  "EN_GRACIA",
  "VENCIDA",
];

const snapshotComercio = (comercio: {
  id: number;
  nombre: string;
  slug: string;
  activo: boolean;
  plan: Plan;
  accesoHasta: Date | null;
  motivoSuspension: string | null;
}) => ({
  id: comercio.id,
  nombre: comercio.nombre,
  slug: comercio.slug,
  activo: comercio.activo,
  plan: comercio.plan,
  accesoHasta: comercio.accesoHasta
    ? comercio.accesoHasta.toISOString()
    : null,
  motivoSuspension: comercio.motivoSuspension,
});

const mapearComercio = (comercio: ComercioConConteos, ahora: Date) => {
  const { estado, diasRestantes } = estadoSuscripcion(
    { activo: comercio.activo, accesoHasta: comercio.accesoHasta },
    ahora
  );

  const conteos = {
    usuarios: comercio._count.usuarios,
    productos: comercio._count.productos,
    ventas: comercio._count.ventas,
  };

  return {
    id: comercio.id,
    nombre: comercio.nombre,
    slug: comercio.slug,
    activo: comercio.activo,
    plan: comercio.plan,
    accesoHasta: comercio.accesoHasta,
    motivoSuspension: comercio.motivoSuspension,
    estadoSuscripcion: estado,
    diasRestantes: diasRestantes ?? null,
    ultimoLogin: comercio.ultimoLogin,
    fechaCreacion: comercio.fechaCreacion,
    _count: conteos,
    conteos,
  };
};

const login = async (data: LoginPlataformaDTO) => {
  const superadmin = await superadminRepository.findByEmail(
    data.email.trim().toLowerCase()
  );

  if (!superadmin || !superadmin.activo) {
    throw new UnauthorizedError("Credenciales inválidas");
  }

  const passwordValida = await bcrypt.compare(data.password, superadmin.password);
  if (!passwordValida) {
    throw new UnauthorizedError("Credenciales inválidas");
  }

  const accessToken = jwt.sign(
    { sub: superadmin.id, tipo: "plataforma" },
    obtenerSecretoPlataforma(),
    { expiresIn: DURACION_TOKEN_PLATAFORMA } as jwt.SignOptions
  );

  return {
    accessToken,
    token: accessToken,
    superadmin: {
      id: superadmin.id,
      nombre: superadmin.nombre,
      email: superadmin.email,
    },
  };
};

// El estado de suscripción depende de la fecha actual y de dos campos, así que
// no se puede filtrar en SQL con el schema actual. Cuando se pide `estado`, se
// traen los comercios que cumplen `q` y se filtra/pagina en memoria. Es
// aceptable para una consola de administración; si la cantidad de comercios
// crece mucho, conviene persistir el estado o calcularlo en SQL.
const listarComercios = async ({
  page,
  limit,
  estado,
  q,
}: ListarComerciosDTO) => {
  const ahora = new Date();

  if (estado !== undefined && !ESTADOS_SUSCRIPCION.includes(estado as EstadoSuscripcion)) {
    throw new BadRequestError("Estado de suscripción inválido");
  }

  const where: Prisma.ComercioWhereInput = {};
  const termino = q?.trim();
  if (termino) {
    where.OR = [
      { nombre: { contains: termino, mode: "insensitive" } },
      { slug: { contains: termino, mode: "insensitive" } },
    ];
  }

  const skip = (page - 1) * limit;

  if (estado !== undefined) {
    const todos = await plataformaRepository.findComerciosTodos(where);
    const filtrados = todos
      .map((comercio) => mapearComercio(comercio, ahora))
      .filter((comercio) => comercio.estadoSuscripcion === estado);

    const total = filtrados.length;
    return {
      data: filtrados.slice(skip, skip + limit),
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  }

  const [comercios, total] = await Promise.all([
    plataformaRepository.findComercios(where, skip, limit),
    plataformaRepository.countComercios(where),
  ]);

  return {
    data: comercios.map((comercio) => mapearComercio(comercio, ahora)),
    meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
  };
};

const obtenerComercio = async (id: number) => {
  const comercio = await plataformaRepository.findComercioDetalle(id);
  if (!comercio) {
    throw new NotFoundError("Comercio no encontrado");
  }

  const { pagos, auditorias, ...base } = comercio;
  return {
    ...mapearComercio(base, new Date()),
    pagos,
    auditorias,
  };
};

const crearComercio = async (
  data: CrearComercioPlataformaDTO,
  superadminId: number,
  ip: string | null
) => {
  const ahora = new Date();

  return prisma.$transaction(async (tx) => {
    const resultado = await comercioService.registrar(
      { ...data, dias: data.dias ?? DIAS_PRUEBA },
      { tx, ahora, plan: "PRUEBA" }
    );

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.CREAR_COMERCIO,
        detalle: {
          antes: null,
          despues: snapshotComercio(resultado.comercio),
        },
        ip,
        superadminId,
        comercioId: resultado.comercio.id,
      },
      tx
    );

    return resultado;
  });
};

const suspenderComercio = async (
  id: number,
  motivo: string,
  superadminId: number,
  ip: string | null
) => {
  const resultado = await prisma.$transaction(async (tx) => {
    const comercio = await plataformaRepository.findComercioById(id, tx);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }
    if (!comercio.activo) {
      throw new ConflictError("El comercio ya está suspendido");
    }

    const cambio = await plataformaRepository.updateComercioCondicional(
      { id, activo: true },
      { activo: false, motivoSuspension: motivo },
      tx
    );
    if (cambio.count === 0) {
      throw new ConflictError("El comercio ya está suspendido");
    }

    await plataformaRepository.revocarRefreshTokensDeComercio(id, tx);

    const actualizado = await plataformaRepository.findComercioById(id, tx);
    if (!actualizado) {
      throw new NotFoundError("Comercio no encontrado");
    }

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.SUSPENDER,
        detalle: {
          antes: snapshotComercio(comercio),
          despues: snapshotComercio(actualizado),
        },
        ip,
        superadminId,
        comercioId: id,
      },
      tx
    );

    return actualizado;
  });

  invalidarVigencia(id);
  return resultado;
};

const reactivarComercio = async (
  id: number,
  superadminId: number,
  ip: string | null
) => {
  const resultado = await prisma.$transaction(async (tx) => {
    const comercio = await plataformaRepository.findComercioById(id, tx);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }
    if (comercio.activo) {
      throw new ConflictError("El comercio ya está activo");
    }

    const cambio = await plataformaRepository.updateComercioCondicional(
      { id, activo: false },
      { activo: true, motivoSuspension: null },
      tx
    );
    if (cambio.count === 0) {
      throw new ConflictError("El comercio ya está activo");
    }

    const actualizado = await plataformaRepository.findComercioById(id, tx);
    if (!actualizado) {
      throw new NotFoundError("Comercio no encontrado");
    }

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.REACTIVAR,
        detalle: {
          antes: snapshotComercio(comercio),
          despues: snapshotComercio(actualizado),
        },
        ip,
        superadminId,
        comercioId: id,
      },
      tx
    );

    return actualizado;
  });

  invalidarVigencia(id);
  return resultado;
};

const extenderAcceso = async (
  id: number,
  dias: number,
  superadminId: number,
  ip: string | null
) => {
  const resultado = await prisma.$transaction(async (tx) => {
    const comercio = await plataformaRepository.findComercioById(id, tx);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }

    const accesoHasta = calcularNuevoAcceso({
      accesoHastaActual: comercio.accesoHasta,
      ahora: new Date(),
      dias,
    });

    const actualizado = await plataformaRepository.updateComercio(
      id,
      { accesoHasta },
      tx
    );

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.EXTENDER_ACCESO,
        detalle: {
          antes: snapshotComercio(comercio),
          despues: snapshotComercio(actualizado),
        },
        ip,
        superadminId,
        comercioId: id,
      },
      tx
    );

    return actualizado;
  });

  invalidarVigencia(id);
  return resultado;
};

const cambiarPlan = async (
  id: number,
  plan: Plan,
  superadminId: number,
  ip: string | null
) => {
  const resultado = await prisma.$transaction(async (tx) => {
    const comercio = await plataformaRepository.findComercioById(id, tx);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }

    const actualizado = await plataformaRepository.updateComercio(
      id,
      { plan },
      tx
    );

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.CAMBIAR_PLAN,
        detalle: {
          antes: snapshotComercio(comercio),
          despues: snapshotComercio(actualizado),
        },
        ip,
        superadminId,
        comercioId: id,
      },
      tx
    );

    return actualizado;
  });

  invalidarVigencia(id);
  return resultado;
};

const registrarPago = async (
  id: number,
  data: RegistrarPagoDTO,
  superadminId: number,
  ip: string | null
) => {
  if ((data.plan as string) === "PRUEBA") {
    throw new BadRequestError("El plan PRUEBA no es pagable");
  }
  if (!Number.isInteger(data.meses) || data.meses < 1 || data.meses > 24) {
    throw new BadRequestError("La cantidad de meses debe estar entre 1 y 24");
  }
  if (!Number.isFinite(data.monto) || data.monto <= 0) {
    throw new BadRequestError("El monto debe ser mayor a 0");
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const comercio = await plataformaRepository.findComercioById(id, tx);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }

    const ahora = new Date();
    const accesoDesde =
      comercio.accesoHasta && comercio.accesoHasta.getTime() > ahora.getTime()
        ? comercio.accesoHasta
        : ahora;
    const accesoHasta = calcularNuevoAcceso({
      accesoHastaActual: comercio.accesoHasta,
      ahora,
      meses: data.meses,
    });

    // Actualización condicionada al accesoHasta leído: si otro pago concurrente
    // ya lo movió, este no pisa meses y se responde 409 para reintentar.
    const cambio = await plataformaRepository.updateComercioCondicional(
      { id, accesoHasta: comercio.accesoHasta },
      { plan: data.plan, accesoHasta },
      tx
    );
    if (cambio.count === 0) {
      throw new ConflictError("El comercio cambió, reintentá");
    }

    const pago = await plataformaRepository.crearPago(
      {
        monto: data.monto,
        metodo: data.metodo,
        referencia: data.referencia ?? null,
        nota: data.nota ?? null,
        plan: data.plan,
        mesesAcreditados: data.meses,
        accesoDesde,
        accesoHasta,
        comercioId: id,
        registradoPorId: superadminId,
      },
      tx
    );

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.REGISTRAR_PAGO,
        detalle: {
          antes: snapshotComercio(comercio),
          despues: {
            ...snapshotComercio({ ...comercio, plan: data.plan, accesoHasta }),
            pagoId: pago.id,
            mesesAcreditados: data.meses,
            monto: data.monto,
          },
        },
        ip,
        superadminId,
        comercioId: id,
      },
      tx
    );

    return pago;
  });

  invalidarVigencia(id);
  return resultado;
};

const listarPagos = async (id: number, page: number, limit: number) => {
  const comercio = await plataformaRepository.findComercioById(id);
  if (!comercio) {
    throw new NotFoundError("Comercio no encontrado");
  }

  const skip = (page - 1) * limit;
  const [pagos, total] = await Promise.all([
    plataformaRepository.findPagos(id, skip, limit),
    plataformaRepository.countPagos(id),
  ]);

  return {
    data: pagos,
    meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
  };
};

const listarAuditoria = async ({
  comercioId,
  page,
  limit,
}: {
  comercioId?: number;
  page: number;
  limit: number;
}) => {
  if (comercioId !== undefined) {
    const comercio = await plataformaRepository.findComercioById(comercioId);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }
  }

  const where: Prisma.AuditoriaPlataformaWhereInput =
    comercioId !== undefined ? { comercioId } : {};
  const skip = (page - 1) * limit;
  const [auditorias, total] = await Promise.all([
    plataformaRepository.findAuditorias(where, skip, limit),
    plataformaRepository.countAuditorias(where),
  ]);

  return {
    data: auditorias,
    meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
  };
};

const MS_DIA = 24 * 60 * 60 * 1000;
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;

const rangoMesActualArgentina = (ahora: Date) => {
  const horaArgentina = new Date(ahora.getTime() + OFFSET_ARGENTINA_MS);
  const desde = new Date(
    Date.UTC(horaArgentina.getUTCFullYear(), horaArgentina.getUTCMonth(), 1) -
      OFFSET_ARGENTINA_MS
  );
  const hasta = new Date(
    Date.UTC(
      horaArgentina.getUTCFullYear(),
      horaArgentina.getUTCMonth() + 1,
      1
    ) - OFFSET_ARGENTINA_MS
  );
  return { desde, hasta };
};

export interface EditarUsuarioPlataformaDTO {
  nombre?: string;
  email?: string;
  rol?: RolUsuario;
  activo?: boolean;
}

const snapshotUsuario = (usuario: {
  id: number;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  debeCambiarPassword: boolean;
}) => ({
  id: usuario.id,
  nombre: usuario.nombre,
  email: usuario.email,
  rol: usuario.rol,
  activo: usuario.activo,
  debeCambiarPassword: usuario.debeCambiarPassword,
});

const ALFABETO_PASSWORD_TEMPORAL =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const generarPasswordTemporal = () => {
  let password = "";
  for (let i = 0; i < 12; i += 1) {
    password += ALFABETO_PASSWORD_TEMPORAL[
      crypto.randomInt(ALFABETO_PASSWORD_TEMPORAL.length)
    ];
  }
  return password;
};

const listarUsuariosComercio = async (
  comercioId: number,
  page: number,
  limit: number,
  q?: string
) => {
  const comercio = await plataformaRepository.findComercioById(comercioId);
  if (!comercio) {
    throw new NotFoundError("Comercio no encontrado");
  }

  const termino = typeof q === "string" ? q.trim() : "";
  const filtro = termino && termino.length <= 100 ? termino : undefined;
  const skip = (page - 1) * limit;

  const [usuarios, total] = await Promise.all([
    plataformaRepository.findUsuariosDeComercio(comercioId, skip, limit, filtro),
    plataformaRepository.countUsuariosDeComercio(comercioId, filtro),
  ]);

  return {
    data: usuarios,
    meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
  };
};

const editarUsuarioComercio = async (
  comercioId: number,
  usuarioId: number,
  data: EditarUsuarioPlataformaDTO,
  superadminId: number,
  ip: string | null
) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const comercio = await plataformaRepository.findComercioById(
        comercioId,
        tx
      );
      if (!comercio) {
        throw new NotFoundError("Comercio no encontrado");
      }

      const usuario = await plataformaRepository.findUsuarioDeComercio(
        comercioId,
        usuarioId,
        tx
      );
      if (!usuario) {
        throw new NotFoundError("Usuario no encontrado");
      }

      const nuevoRol = data.rol ?? usuario.rol;
      const nuevoActivo = data.activo ?? usuario.activo;

      const dejaDeSerAdminActivo =
        usuario.rol === "ADMIN" &&
        usuario.activo &&
        (data.activo === false || data.rol === "VENDEDOR");

      if (dejaDeSerAdminActivo) {
        const admins = await plataformaRepository.findUsuariosActivosPorRol(
          comercioId,
          "ADMIN",
          tx
        );
        if (!admins.some((admin) => admin.id !== usuarioId)) {
          throw new ConflictError(
            "No se puede desactivar ni quitar el rol al único administrador del comercio"
          );
        }
      }

      const pasaASerAdminActivo =
        nuevoRol === "ADMIN" &&
        nuevoActivo &&
        !(usuario.rol === "ADMIN" && usuario.activo);

      if (pasaASerAdminActivo) {
        const admins = await plataformaRepository.findUsuariosActivosPorRol(
          comercioId,
          "ADMIN",
          tx
        );
        if (admins.some((admin) => admin.id !== usuarioId)) {
          throw new ConflictError(
            "Ya existe un administrador activo en este comercio"
          );
        }
      }

      const cambios: Prisma.UsuarioUncheckedUpdateInput = {};
      if (data.nombre !== undefined) cambios.nombre = data.nombre;
      if (data.rol !== undefined) cambios.rol = data.rol;
      if (data.activo !== undefined) cambios.activo = data.activo;

      if (data.email !== undefined) {
        const email = data.email.trim().toLowerCase();
        const existente = await plataformaRepository.findUsuarioPorEmail(
          comercioId,
          email,
          tx
        );
        if (existente && existente.id !== usuarioId) {
          throw new ConflictError(
            "Ya existe un usuario con ese email en este comercio"
          );
        }
        cambios.email = email;
      }

      if (data.activo === false) {
        await plataformaRepository.revocarRefreshTokensDeUsuario(
          usuarioId,
          tx
        );
      }

      const actualizado = await plataformaRepository.updateUsuario(
        usuarioId,
        comercioId,
        cambios,
        tx
      );

      await plataformaRepository.crearAuditoria(
        {
          accion: AccionPlataforma.EDITAR_USUARIO,
          detalle: {
            antes: snapshotUsuario(usuario),
            despues: snapshotUsuario(actualizado),
          },
          ip,
          superadminId,
          comercioId,
        },
        tx
      );

      return actualizado;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError(
        "Ya existe un administrador activo en este comercio"
      );
    }
    throw error;
  }
};

const resetearPasswordUsuario = async (
  comercioId: number,
  usuarioId: number,
  superadminId: number,
  ip: string | null
) => {
  const passwordTemporal = generarPasswordTemporal();
  const passwordHasheada = await bcrypt.hash(passwordTemporal, 10);

  await prisma.$transaction(async (tx) => {
    const comercio = await plataformaRepository.findComercioById(
      comercioId,
      tx
    );
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }

    const usuario = await plataformaRepository.findUsuarioDeComercio(
      comercioId,
      usuarioId,
      tx
    );
    if (!usuario) {
      throw new NotFoundError("Usuario no encontrado");
    }

    await plataformaRepository.updateUsuario(
      usuarioId,
      comercioId,
      { password: passwordHasheada, debeCambiarPassword: true },
      tx
    );

    await plataformaRepository.revocarRefreshTokensDeUsuario(usuarioId, tx);

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.RESETEAR_PASSWORD,
        detalle: { usuarioId },
        ip,
        superadminId,
        comercioId,
      },
      tx
    );
  });

  return { passwordTemporal };
};

export interface ErrorFilaCarga {
  fila: number;
  campo?: string;
  mensaje: string;
}

export type ResultadoCargaMasiva =
  | { ok: false; errores: ErrorFilaCarga[] }
  | { ok: true; validas: number; simulacion: true }
  | { ok: true; creados: number };

const erroresDeParseo = (
  issues: { path: (string | number)[]; message: string }[],
  fila: number
): ErrorFilaCarga[] =>
  issues.map((issue) => ({
    fila,
    campo: issue.path.length > 0 ? issue.path.join(".") : undefined,
    mensaje: issue.message,
  }));

const cargaMasivaCategorias = async (
  comercioId: number,
  data: { categorias: unknown[]; simular?: boolean },
  superadminId: number,
  ip: string | null
): Promise<ResultadoCargaMasiva> => {
  if (data.categorias.length < 1 || data.categorias.length > 50) {
    throw new BadRequestError(
      "La carga masiva debe tener entre 1 y 50 categorías"
    );
  }

  const comercio = await plataformaRepository.findComercioById(comercioId);
  if (!comercio) {
    throw new NotFoundError("Comercio no encontrado");
  }

  const errores: ErrorFilaCarga[] = [];
  const validas: CategoriaMasivaFilaInput[] = [];
  const vistos = new Map<string, number>();
  const existentes = new Set(
    (await categoriaRepository.findAllParaCargaMasiva(comercioId)).map(
      (categoria) => categoria.nombre.toLowerCase()
    )
  );

  data.categorias.forEach((fila, indice) => {
    const numero = indice + 1;
    const parseo = categoriaMasivaFilaSchema.safeParse(fila);
    if (!parseo.success) {
      errores.push(...erroresDeParseo(parseo.error.issues, numero));
      return;
    }

    const clave = parseo.data.nombre.toLowerCase();
    if (vistos.has(clave)) {
      errores.push({
        fila: numero,
        campo: "nombre",
        mensaje: `Nombre de categoría duplicado en el pedido (también en la fila ${vistos.get(clave)})`,
      });
      return;
    }
    vistos.set(clave, numero);

    if (existentes.has(clave)) {
      errores.push({
        fila: numero,
        campo: "nombre",
        mensaje: "Ya existe una categoría con ese nombre en el comercio",
      });
      return;
    }

    validas.push(parseo.data);
  });

  if (errores.length > 0) {
    return { ok: false, errores };
  }

  if (data.simular) {
    return { ok: true, validas: validas.length, simulacion: true };
  }

  const creados = await prisma.$transaction(async (tx) => {
    for (const fila of validas) {
      await categoriaRepository.create(
        {
          nombre: fila.nombre,
          descripcion: fila.descripcion,
          comercio: { connect: { id: comercioId } },
        },
        tx
      );
    }

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.CARGA_MASIVA_CATEGORIAS,
        detalle: { cantidad: validas.length, simulacion: false },
        ip,
        superadminId,
        comercioId,
      },
      tx
    );

    return validas.length;
  });

  return { ok: true, creados };
};

const cargaMasivaProductos = async (
  comercioId: number,
  data: { productos: unknown[]; simular?: boolean },
  superadminId: number,
  ip: string | null
): Promise<ResultadoCargaMasiva> => {
  if (data.productos.length < 1 || data.productos.length > 50) {
    throw new BadRequestError(
      "La carga masiva debe tener entre 1 y 50 productos"
    );
  }

  const comercio = await plataformaRepository.findComercioById(comercioId);
  if (!comercio) {
    throw new NotFoundError("Comercio no encontrado");
  }

  const [productosExistentes, categoriasExistentes] = await Promise.all([
    productoRepository.findAllParaCargaMasiva(comercioId),
    categoriaRepository.findAllParaCargaMasiva(comercioId),
  ]);

  const nombresExistentes = new Set(
    productosExistentes.map((producto) => producto.nombre.toLowerCase())
  );
  const codigosExistentes = new Set(
    productosExistentes
      .map((producto) => producto.codigoBarras)
      .filter((codigo): codigo is string => codigo !== null)
  );
  const categoriasPorNombre = new Map(
    categoriasExistentes.map((categoria) => [
      categoria.nombre.toLowerCase(),
      categoria.id,
    ])
  );

  const errores: ErrorFilaCarga[] = [];
  const validas: { fila: ProductoMasivaFilaInput; categoriaId: number }[] = [];
  const nombresVistos = new Map<string, number>();
  const codigosVistos = new Map<string, number>();

  data.productos.forEach((fila, indice) => {
    const numero = indice + 1;
    const parseo = productoMasivaFilaSchema.safeParse(fila);
    if (!parseo.success) {
      errores.push(...erroresDeParseo(parseo.error.issues, numero));
      return;
    }

    const producto = parseo.data;
    let valida = true;

    const nombreClave = producto.nombre.toLowerCase();
    if (nombresVistos.has(nombreClave)) {
      errores.push({
        fila: numero,
        campo: "nombre",
        mensaje: `Nombre de producto duplicado en el pedido (también en la fila ${nombresVistos.get(nombreClave)})`,
      });
      valida = false;
    } else {
      nombresVistos.set(nombreClave, numero);
    }

    if (nombresExistentes.has(nombreClave)) {
      errores.push({
        fila: numero,
        campo: "nombre",
        mensaje: "Ya existe un producto con ese nombre en el comercio",
      });
      valida = false;
    }

    const categoriaId = categoriasPorNombre.get(
      producto.categoria.toLowerCase()
    );
    if (categoriaId === undefined) {
      errores.push({
        fila: numero,
        campo: "categoria",
        mensaje: "La categoría no existe en el comercio",
      });
      valida = false;
    }

    if (producto.codigoBarras !== undefined) {
      if (codigosVistos.has(producto.codigoBarras)) {
        errores.push({
          fila: numero,
          campo: "codigoBarras",
          mensaje: `Código de barras duplicado en el pedido (también en la fila ${codigosVistos.get(producto.codigoBarras)})`,
        });
        valida = false;
      } else {
        codigosVistos.set(producto.codigoBarras, numero);
      }

      if (codigosExistentes.has(producto.codigoBarras)) {
        errores.push({
          fila: numero,
          campo: "codigoBarras",
          mensaje: "Ya existe un producto con ese código de barras en el comercio",
        });
        valida = false;
      }
    }

    if (valida && categoriaId !== undefined) {
      validas.push({ fila: producto, categoriaId });
    }
  });

  if (errores.length > 0) {
    return { ok: false, errores };
  }

  if (data.simular) {
    return { ok: true, validas: validas.length, simulacion: true };
  }

  const creados = await prisma.$transaction(async (tx) => {
    for (const { fila, categoriaId } of validas) {
      const { categoria, ...resto } = fila;
      await productoRepository.create(
        {
          ...resto,
          activo: true,
          comercio: { connect: { id: comercioId } },
          categoria: { connect: { id: categoriaId } },
        },
        tx
      );
    }

    await plataformaRepository.crearAuditoria(
      {
        accion: AccionPlataforma.CARGA_MASIVA_PRODUCTOS,
        detalle: { cantidad: validas.length, simulacion: false },
        ip,
        superadminId,
        comercioId,
      },
      tx
    );

    return validas.length;
  });

  return { ok: true, creados };
};

const obtenerMetricas = async () => {
  const ahora = new Date();
  const comercios = await plataformaRepository.findComerciosParaMetricas();

  const porEstado: Record<EstadoSuscripcion, number> = {
    SUSPENDIDO: 0,
    SIN_VENCIMIENTO: 0,
    VIGENTE: 0,
    EN_GRACIA: 0,
    VENCIDA: 0,
  };

  const limitePrueba = new Date(ahora.getTime() + 7 * MS_DIA);
  const hace30Dias = new Date(ahora.getTime() - 30 * MS_DIA);
  let pruebasPorVencer7Dias = 0;
  let sinIngreso30Dias = 0;

  for (const comercio of comercios) {
    const { estado } = estadoSuscripcion(comercio, ahora);
    porEstado[estado] += 1;

    if (
      comercio.plan === "PRUEBA" &&
      comercio.accesoHasta &&
      comercio.accesoHasta.getTime() >= ahora.getTime() &&
      comercio.accesoHasta.getTime() <= limitePrueba.getTime()
    ) {
      pruebasPorVencer7Dias += 1;
    }

    if (
      !comercio.ultimoLogin ||
      comercio.ultimoLogin.getTime() < hace30Dias.getTime()
    ) {
      sinIngreso30Dias += 1;
    }
  }

  const { desde, hasta } = rangoMesActualArgentina(ahora);
  const pagos = await plataformaRepository.sumarPagosPorMoneda(desde, hasta);

  return {
    totalComercios: comercios.length,
    porEstado,
    pruebasPorVencer7Dias,
    sinIngreso30Dias,
    pagosMes: pagos.map((pago) => ({
      moneda: pago.moneda,
      total: Number(pago._sum.monto ?? 0),
    })),
  };
};

export const plataformaService = {
  login,
  listarComercios,
  obtenerComercio,
  crearComercio,
  suspenderComercio,
  reactivarComercio,
  extenderAcceso,
  cambiarPlan,
  registrarPago,
  listarPagos,
  listarAuditoria,
  listarUsuariosComercio,
  editarUsuarioComercio,
  resetearPasswordUsuario,
  cargaMasivaCategorias,
  cargaMasivaProductos,
  obtenerMetricas,
};
