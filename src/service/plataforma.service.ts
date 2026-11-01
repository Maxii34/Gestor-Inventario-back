import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { AccionPlataforma, MetodoCobro, Plan, Prisma } from "../generated/prisma/client";
import { superadminRepository } from "../repositores/superadmin.repository";
import { plataformaRepository } from "../repositores/plataforma.repository";
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
) =>
  prisma.$transaction(async (tx) => {
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

const reactivarComercio = async (
  id: number,
  superadminId: number,
  ip: string | null
) =>
  prisma.$transaction(async (tx) => {
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

const extenderAcceso = async (
  id: number,
  dias: number,
  superadminId: number,
  ip: string | null
) =>
  prisma.$transaction(async (tx) => {
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

const cambiarPlan = async (
  id: number,
  plan: Plan,
  superadminId: number,
  ip: string | null
) =>
  prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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
  obtenerMetricas,
};
