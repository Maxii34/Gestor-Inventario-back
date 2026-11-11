import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { plataformaService } from "./plataforma.service";
import { plataformaRepository } from "../repositores/plataforma.repository";
import { superadminRepository } from "../repositores/superadmin.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { productoRepository } from "../repositores/producto.repository";
import { comercioService } from "./comercio.service";
import { prisma } from "../config/prisma";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors";
import { calcularNuevoAcceso } from "../utils/suscripcion";
import { finDeDiaArgentina, inicioDeDiaArgentina } from "../utils/fechas";
import { invalidarVigencia } from "../middlewares/vigencia.middleware";

vi.mock("../repositores/plataforma.repository");
vi.mock("../repositores/superadmin.repository");
vi.mock("../repositores/categoria.repository");
vi.mock("../repositores/producto.repository");
vi.mock("./comercio.service");
vi.mock("bcrypt");
vi.mock("jsonwebtoken");
vi.mock("../middlewares/vigencia.middleware", () => ({
  invalidarVigencia: vi.fn(),
}));
const { txMock } = vi.hoisted(() => ({ txMock: {} }));
vi.mock("../config/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(txMock)),
  },
}));

const SUPERADMIN = {
  id: 7,
  nombre: "Dueño",
  email: "super@test.com",
  password: "hash",
  activo: true,
  fechaCreacion: new Date("2025-11-01T12:00:00.000Z"),
  fechaActualizacion: new Date("2025-11-01T12:00:00.000Z"),
};

const COMERCIO = {
  id: 5,
  nombre: "Kiosco",
  slug: "kiosco",
  activo: true,
  plan: "PRUEBA" as const,
  accesoHasta: new Date("2025-11-15T02:59:59.999Z"),
  motivoSuspension: null,
  ultimoLogin: null,
  fechaCreacion: new Date("2025-11-01T12:00:00.000Z"),
  fechaActualizacion: new Date("2025-11-01T12:00:00.000Z"),
  _count: { usuarios: 1, productos: 2, ventas: 3 },
};

const tx = txMock;

describe("plataformaService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLATAFORMA_JWT_SECRET = "secreto-plataforma-test";
  });

  afterEach(() => {
    delete process.env.PLATAFORMA_JWT_SECRET;
  });

  it("normaliza el email, valida la contraseña y firma un token de plataforma", async () => {
    vi.mocked(superadminRepository.findByEmail).mockResolvedValue(SUPERADMIN as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(jwt.sign).mockReturnValue("token-plataforma" as never);

    const resultado = await plataformaService.login({
      email: "  SUPER@Test.com ",
      password: "secreta123",
    });

    expect(superadminRepository.findByEmail).toHaveBeenCalledWith("super@test.com");
    expect(bcrypt.compare).toHaveBeenCalledWith("secreta123", "hash");
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 7, tipo: "plataforma" },
      "secreto-plataforma-test",
      { expiresIn: "2h" }
    );
    expect(resultado.accessToken).toBe("token-plataforma");
    expect(resultado.token).toBe("token-plataforma");
    expect(resultado.superadmin).not.toHaveProperty("password");
  });

  it("rechaza un superadmin inactivo sin comparar la contraseña", async () => {
    vi.mocked(superadminRepository.findByEmail).mockResolvedValue({
      ...SUPERADMIN,
      activo: false,
    } as never);

    await expect(
      plataformaService.login({ email: "super@test.com", password: "secreta123" })
    ).rejects.toThrow(UnauthorizedError);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña incorrecta con el error genérico", async () => {
    vi.mocked(superadminRepository.findByEmail).mockResolvedValue(SUPERADMIN as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      plataformaService.login({ email: "super@test.com", password: "mala" })
    ).rejects.toThrow("Credenciales inválidas");
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});

describe("plataformaService.listarComercios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-11-10T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filtra por estado calculado en memoria y pagina el resultado", async () => {
    const suspendido = {
      ...COMERCIO,
      id: 6,
      activo: false,
      accesoHasta: null,
    };
    vi.mocked(plataformaRepository.findComerciosTodos).mockResolvedValue([
      COMERCIO,
      suspendido,
    ] as never);

    const resultado = await plataformaService.listarComercios({
      page: 1,
      limit: 10,
      estado: "VIGENTE",
    });

    expect(resultado.meta.total).toBe(1);
    expect(resultado.data).toHaveLength(1);
    expect(resultado.data[0].id).toBe(5);
    expect(resultado.data[0].estadoSuscripcion).toBe("VIGENTE");
    expect(resultado.data[0]._count).toEqual({
      usuarios: 1,
      productos: 2,
      ventas: 3,
    });
  });

  it("sin estado usa paginación SQL y devuelve solo conteos, no contenido de negocio", async () => {
    vi.mocked(plataformaRepository.findComercios).mockResolvedValue([COMERCIO] as never);
    vi.mocked(plataformaRepository.countComercios).mockResolvedValue(1);

    const resultado = await plataformaService.listarComercios({
      page: 1,
      limit: 10,
      q: "kiosco",
    });

    expect(plataformaRepository.findComercios).toHaveBeenCalledWith(
      expect.objectContaining({
        OR: expect.any(Array),
      }),
      0,
      10
    );
    expect(resultado.data[0]).not.toHaveProperty("productos");
    expect(resultado.data[0]).not.toHaveProperty("ventas");
    expect(resultado.data[0].conteos).toEqual({
      usuarios: 1,
      productos: 2,
      ventas: 3,
    });
  });

  it("rechaza un estado desconocido con 400", async () => {
    await expect(
      plataformaService.listarComercios({
        page: 1,
        limit: 10,
        estado: "NO_EXISTE",
      })
    ).rejects.toThrow(BadRequestError);
  });
});

describe("plataformaService.obtenerComercio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el comercio no existe", async () => {
    vi.mocked(plataformaRepository.findComercioDetalle).mockResolvedValue(null);

    await expect(plataformaService.obtenerComercio(999)).rejects.toThrow(
      NotFoundError
    );
  });

  it("incluye pagos y auditorías sin contenido de negocio", async () => {
    vi.mocked(plataformaRepository.findComercioDetalle).mockResolvedValue({
      ...COMERCIO,
      pagos: [{ id: 1 }],
      auditorias: [{ id: 2 }],
    } as never);

    const resultado = await plataformaService.obtenerComercio(5);

    expect(resultado.pagos).toEqual([{ id: 1 }]);
    expect(resultado.auditorias).toEqual([{ id: 2 }]);
    expect(resultado).not.toHaveProperty("productos");
    expect(resultado).not.toHaveProperty("ventas");
  });
});

describe("plataformaService.crearComercio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reutiliza comercioService.registrar y audita en la misma transacción", async () => {
    vi.mocked(comercioService.registrar).mockResolvedValue({
      comercio: COMERCIO as never,
      administrador: { id: 1, email: "admin@test.com" } as never,
    });
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.crearComercio(
      {
        nombre: "Kiosco",
        adminNombre: "Admin",
        adminEmail: "admin@test.com",
        adminPassword: "123456",
        dias: 20,
      },
      7,
      "127.0.0.1"
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(comercioService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ dias: 20 }),
      { tx, ahora: expect.any(Date), plan: "PRUEBA" }
    );
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "CREAR_COMERCIO",
        detalle: { antes: null, despues: expect.objectContaining({ id: 5 }) },
        ip: "127.0.0.1",
        superadminId: 7,
        comercioId: 5,
      }),
      tx
    );
    expect(resultado.comercio.id).toBe(5);
  });
});

describe("plataformaService.suspenderComercio / reactivarComercio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suspende, revoca refresh tokens y audita antes/después", async () => {
    const suspendido = {
      ...COMERCIO,
      activo: false,
      motivoSuspension: "impago",
    };
    vi.mocked(plataformaRepository.findComercioById)
      .mockResolvedValueOnce(COMERCIO as never)
      .mockResolvedValueOnce(suspendido as never);
    vi.mocked(plataformaRepository.updateComercioCondicional).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(plataformaRepository.revocarRefreshTokensDeComercio).mockResolvedValue({
      count: 2,
    } as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.suspenderComercio(
      5,
      "impago",
      7,
      "127.0.0.1"
    );

    expect(plataformaRepository.updateComercioCondicional).toHaveBeenCalledWith(
      { id: 5, activo: true },
      { activo: false, motivoSuspension: "impago" },
      tx
    );
    expect(plataformaRepository.revocarRefreshTokensDeComercio).toHaveBeenCalledWith(
      5,
      tx
    );
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "SUSPENDER",
        detalle: {
          antes: expect.objectContaining({ activo: true }),
          despues: expect.objectContaining({ activo: false }),
        },
      }),
      tx
    );
    expect(resultado.activo).toBe(false);
  });

  it("rechaza suspender un comercio ya suspendido sin tocar tokens", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue({
      ...COMERCIO,
      activo: false,
    } as never);

    await expect(
      plataformaService.suspenderComercio(5, "otra", 7, null)
    ).rejects.toThrow(ConflictError);
    expect(plataformaRepository.revocarRefreshTokensDeComercio).not.toHaveBeenCalled();
  });

  it("si otra operación cambió el comercio, responde 409 sin revocar tokens", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.updateComercioCondicional).mockResolvedValue({
      count: 0,
    } as never);

    await expect(
      plataformaService.suspenderComercio(5, "impago", 7, null)
    ).rejects.toThrow(ConflictError);
    expect(plataformaRepository.revocarRefreshTokensDeComercio).not.toHaveBeenCalled();
  });

  it("reactiva un comercio suspendido y audita", async () => {
    const suspendido = {
      ...COMERCIO,
      activo: false,
      motivoSuspension: "impago",
    };
    const reactivado = { ...COMERCIO, activo: true, motivoSuspension: null };
    vi.mocked(plataformaRepository.findComercioById)
      .mockResolvedValueOnce(suspendido as never)
      .mockResolvedValueOnce(reactivado as never);
    vi.mocked(plataformaRepository.updateComercioCondicional).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.reactivarComercio(5, 7, null);

    expect(plataformaRepository.updateComercioCondicional).toHaveBeenCalledWith(
      { id: 5, activo: false },
      { activo: true, motivoSuspension: null },
      tx
    );
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "REACTIVAR" }),
      tx
    );
    expect(resultado.activo).toBe(true);
  });

  it("rechaza reactivar un comercio ya activo", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);

    await expect(
      plataformaService.reactivarComercio(5, 7, null)
    ).rejects.toThrow(ConflictError);
  });
});

describe("plataformaService.eliminarComercio", () => {
  const ORDEN_BORRADO = [
    "detalleVenta",
    "venta",
    "movimientoStock",
    "producto",
    "categoria",
    "cliente",
    "proveedor",
    "usuario",
  ];

  const comercioEliminable = {
    id: 5,
    nombre: "Kiosco",
    slug: "kiosco",
    activo: false,
    plan: "PRUEBA" as const,
    accesoHasta: new Date("2025-11-15T02:59:59.999Z"),
    _count: { usuarios: 1, productos: 2, ventas: 3, pagos: 4 },
  };

  let orden: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    orden = [];

    const txBorrado = tx as Record<string, any>;
    for (const modelo of [...ORDEN_BORRADO, "comercio"]) {
      txBorrado[modelo] = {
        deleteMany: vi.fn(async () => {
          orden.push(modelo);
          return { count: 0 };
        }),
        delete: vi.fn(async () => {
          orden.push(modelo);
          return {};
        }),
      };
    }

    vi.mocked(plataformaRepository.findComercioParaEliminar).mockResolvedValue(
      comercioEliminable as never
    );
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);
  });

  it("borra en el orden pedido, audita el resumen, elimina el comercio al final e invalida la vigencia", async () => {
    const resultado = await plataformaService.eliminarComercio(
      5,
      "kiosco",
      7,
      "127.0.0.1"
    );

    expect(orden).toEqual([...ORDEN_BORRADO, "comercio"]);
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      {
        accion: "ELIMINAR_COMERCIO",
        detalle: {
          comercioId: 5,
          nombre: "Kiosco",
          slug: "kiosco",
          plan: "PRUEBA",
          accesoHasta: "2025-11-15T02:59:59.999Z",
          conteos: { usuarios: 1, productos: 2, ventas: 3, pagos: 4 },
        },
        ip: "127.0.0.1",
        superadminId: 7,
        comercioId: null,
      },
      tx
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
    });
    expect(invalidarVigencia).toHaveBeenCalledWith(5);
    expect(resultado).toEqual({
      comercioId: 5,
      nombre: "Kiosco",
      slug: "kiosco",
      plan: "PRUEBA",
      accesoHasta: "2025-11-15T02:59:59.999Z",
      conteos: { usuarios: 1, productos: 2, ventas: 3, pagos: 4 },
    });
  });

  it("404 si el comercio no existe", async () => {
    vi.mocked(plataformaRepository.findComercioParaEliminar).mockResolvedValue(
      null
    );

    await expect(
      plataformaService.eliminarComercio(999, "kiosco", 7, null)
    ).rejects.toThrow(NotFoundError);
    expect(orden).toEqual([]);
    expect(invalidarVigencia).not.toHaveBeenCalled();
  });

  it("409 si el comercio sigue activo", async () => {
    vi.mocked(plataformaRepository.findComercioParaEliminar).mockResolvedValue({
      ...comercioEliminable,
      activo: true,
    } as never);

    await expect(
      plataformaService.eliminarComercio(5, "kiosco", 7, null)
    ).rejects.toThrow("Suspendé el negocio antes de eliminarlo");
    expect(orden).toEqual([]);
    expect(invalidarVigencia).not.toHaveBeenCalled();
  });

  it("400 si confirmarSlug no coincide exactamente", async () => {
    await expect(
      plataformaService.eliminarComercio(5, "Kiosco", 7, null)
    ).rejects.toThrow(BadRequestError);
    expect(orden).toEqual([]);
    expect(invalidarVigencia).not.toHaveBeenCalled();
  });
});

describe("plataformaService.extenderAcceso / cambiarPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-11-10T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acumula días sobre el vencimiento y audita EXTENDER_ACCESO", async () => {
    const esperado = calcularNuevoAcceso({
      accesoHastaActual: COMERCIO.accesoHasta,
      ahora: new Date(),
      dias: 10,
    });
    const actualizado = { ...COMERCIO, accesoHasta: esperado };
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.updateComercio).mockResolvedValue(
      actualizado as never
    );
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.extenderAcceso(5, 10, 7, null);

    expect(plataformaRepository.updateComercio).toHaveBeenCalledWith(
      5,
      { accesoHasta: esperado },
      tx
    );
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "EXTENDER_ACCESO",
        detalle: {
          antes: expect.objectContaining({
            accesoHasta: COMERCIO.accesoHasta.toISOString(),
          }),
          despues: expect.objectContaining({
            accesoHasta: esperado.toISOString(),
          }),
        },
      }),
      tx
    );
    expect(resultado.accesoHasta).toBe(esperado);
  });

  it("cambia solo la etiqueta del plan, sin mover la fecha", async () => {
    const actualizado = { ...COMERCIO, plan: "MENSUAL" as const };
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.updateComercio).mockResolvedValue(
      actualizado as never
    );
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.cambiarPlan(5, "MENSUAL", 7, null);

    expect(plataformaRepository.updateComercio).toHaveBeenCalledWith(
      5,
      { plan: "MENSUAL" },
      tx
    );
    expect(resultado.accesoHasta).toBe(COMERCIO.accesoHasta);
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "CAMBIAR_PLAN" }),
      tx
    );
  });
});

describe("plataformaService.registrarPago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-11-10T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acumula meses, crea el Pago y audita con antes/después en la misma transacción", async () => {
    const esperado = calcularNuevoAcceso({
      accesoHastaActual: COMERCIO.accesoHasta,
      ahora: new Date(),
      meses: 3,
    });
    const pago = {
      id: 99,
      monto: 15000,
      plan: "MENSUAL",
      mesesAcreditados: 3,
      accesoDesde: COMERCIO.accesoHasta,
      accesoHasta: esperado,
    };
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.updateComercioCondicional).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(plataformaRepository.crearPago).mockResolvedValue(pago as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.registrarPago(
      5,
      {
        plan: "MENSUAL",
        meses: 3,
        monto: 15000,
        metodo: "TRANSFERENCIA",
        referencia: "ref",
        nota: "nota",
      },
      7,
      "127.0.0.1"
    );

    expect(plataformaRepository.updateComercioCondicional).toHaveBeenCalledWith(
      { id: 5, accesoHasta: COMERCIO.accesoHasta },
      { plan: "MENSUAL", accesoHasta: esperado },
      tx
    );
    expect(plataformaRepository.crearPago).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: 15000,
        metodo: "TRANSFERENCIA",
        plan: "MENSUAL",
        mesesAcreditados: 3,
        accesoDesde: COMERCIO.accesoHasta,
        accesoHasta: esperado,
        comercioId: 5,
        comercioNombre: "Kiosco",
        registradoPorId: 7,
      }),
      tx
    );
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "REGISTRAR_PAGO",
        detalle: {
          antes: expect.objectContaining({
            accesoHasta: COMERCIO.accesoHasta.toISOString(),
          }),
          despues: expect.objectContaining({
            accesoHasta: esperado.toISOString(),
            pagoId: 99,
            mesesAcreditados: 3,
          }),
        },
      }),
      tx
    );
    expect(resultado).toBe(pago);
  });

  it("rechaza el plan PRUEBA antes de abrir la transacción", async () => {
    await expect(
      plataformaService.registrarPago(
        5,
        { plan: "PRUEBA" as never, meses: 1, monto: 100, metodo: "EFECTIVO" },
        7,
        null
      )
    ).rejects.toThrow(BadRequestError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, 25])("rechaza meses fuera de 1..24 (%s)", async (meses) => {
    await expect(
      plataformaService.registrarPago(
        5,
        { plan: "MENSUAL", meses, monto: 100, metodo: "EFECTIVO" },
        7,
        null
      )
    ).rejects.toThrow(BadRequestError);
  });

  it("si el comercio cambió, responde 409 y no crea Pago ni auditoría", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.updateComercioCondicional).mockResolvedValue({
      count: 0,
    } as never);

    await expect(
      plataformaService.registrarPago(
        5,
        { plan: "MENSUAL", meses: 1, monto: 100, metodo: "EFECTIVO" },
        7,
        null
      )
    ).rejects.toThrow("El comercio cambió, reintentá");
    expect(plataformaRepository.crearPago).not.toHaveBeenCalled();
    expect(plataformaRepository.crearAuditoria).not.toHaveBeenCalled();
  });

  it("lanza NotFoundError si el comercio no existe", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(null);

    await expect(
      plataformaService.registrarPago(
        999,
        { plan: "MENSUAL", meses: 1, monto: 100, metodo: "EFECTIVO" },
        7,
        null
      )
    ).rejects.toThrow(NotFoundError);
  });
});

describe("plataformaService.listarPagos / listarAuditoria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista pagos paginados y 404 si el comercio no existe", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.findPagos).mockResolvedValue([{ id: 1 }] as never);
    vi.mocked(plataformaRepository.countPagos).mockResolvedValue(1);

    const resultado = await plataformaService.listarPagos(5, 1, 10);
    expect(resultado.data).toEqual([{ id: 1 }]);
    expect(resultado.meta).toEqual({ total: 1, page: 1, limit: 10, totalPaginas: 1 });

    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(null);
    await expect(plataformaService.listarPagos(999, 1, 10)).rejects.toThrow(
      NotFoundError
    );
  });

  it("lista auditoría global o filtrada y valida que el comercio exista", async () => {
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(COMERCIO as never);
    vi.mocked(plataformaRepository.findAuditorias).mockResolvedValue([{ id: 1 }] as never);
    vi.mocked(plataformaRepository.countAuditorias).mockResolvedValue(1);

    const resultado = await plataformaService.listarAuditoria({
      comercioId: 5,
      page: 1,
      limit: 10,
    });
    expect(plataformaRepository.findAuditorias).toHaveBeenCalledWith(
      { comercioId: 5 },
      0,
      10
    );
    expect(resultado.meta.total).toBe(1);

    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(null);
    await expect(
      plataformaService.listarAuditoria({ comercioId: 999, page: 1, limit: 10 })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("plataformaService.listarPagosGlobal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pagina todos los pagos, incluidos los de negocios eliminados", async () => {
    const pagos = [
      {
        id: 1,
        comercioId: null,
        comercioNombre: "Kiosco viejo",
        monto: 15000,
        moneda: "ARS",
        plan: "MENSUAL",
        mesesAcreditados: 3,
        metodo: "TRANSFERENCIA",
        referencia: "ref-1",
        fecha: new Date("2025-01-10T12:00:00.000Z"),
      },
    ];
    vi.mocked(plataformaRepository.findPagosGlobal).mockResolvedValue(
      pagos as never
    );
    vi.mocked(plataformaRepository.countPagosGlobal).mockResolvedValue(23);

    const resultado = await plataformaService.listarPagosGlobal({
      page: 3,
      limit: 5,
    });

    expect(plataformaRepository.findPagosGlobal).toHaveBeenCalledWith({}, 10, 5);
    expect(plataformaRepository.countPagosGlobal).toHaveBeenCalledWith({});
    expect(resultado.data).toEqual(pagos);
    expect(resultado.meta).toEqual({
      total: 23,
      page: 3,
      limit: 5,
      totalPaginas: 5,
    });
  });

  it("filtra desde y hasta como días calendario argentinos", async () => {
    vi.mocked(plataformaRepository.findPagosGlobal).mockResolvedValue([] as never);
    vi.mocked(plataformaRepository.countPagosGlobal).mockResolvedValue(0);

    await plataformaService.listarPagosGlobal({
      page: 1,
      limit: 10,
      desde: "2025-01-10",
      hasta: "2025-01-20",
    });

    expect(plataformaRepository.findPagosGlobal).toHaveBeenCalledWith(
      {
        fecha: {
          gte: inicioDeDiaArgentina("2025-01-10"),
          lte: finDeDiaArgentina("2025-01-20"),
        },
      },
      0,
      10
    );
    expect(plataformaRepository.countPagosGlobal).toHaveBeenCalledWith({
      fecha: {
        gte: inicioDeDiaArgentina("2025-01-10"),
        lte: finDeDiaArgentina("2025-01-20"),
      },
    });
  });

  it("aplica solo el límite de fecha presente", async () => {
    vi.mocked(plataformaRepository.findPagosGlobal).mockResolvedValue([] as never);
    vi.mocked(plataformaRepository.countPagosGlobal).mockResolvedValue(0);

    await plataformaService.listarPagosGlobal({
      page: 1,
      limit: 10,
      hasta: "2025-01-20",
    });

    expect(plataformaRepository.findPagosGlobal).toHaveBeenCalledWith(
      { fecha: { lte: finDeDiaArgentina("2025-01-20") } },
      0,
      10
    );
  });

  it("rechaza fechas inválidas y rangos invertidos sin consultar", async () => {
    await expect(
      plataformaService.listarPagosGlobal({
        page: 1,
        limit: 10,
        desde: "2025-02-31",
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      plataformaService.listarPagosGlobal({
        page: 1,
        limit: 10,
        desde: "2025-01-20",
        hasta: "2025-01-10",
      })
    ).rejects.toThrow(BadRequestError);

    expect(plataformaRepository.findPagosGlobal).not.toHaveBeenCalled();
    expect(plataformaRepository.countPagosGlobal).not.toHaveBeenCalled();
  });
});

describe("plataformaService.obtenerMetricas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-11-10T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cuenta por estado, pruebas por vencer, inactivos por login y pagos por moneda", async () => {
    const ahora = new Date();
    vi.mocked(plataformaRepository.findComerciosParaMetricas).mockResolvedValue([
      {
        id: 1,
        activo: true,
        accesoHasta: new Date(ahora.getTime() + 2 * 24 * 60 * 60 * 1000),
        plan: "PRUEBA",
        ultimoLogin: new Date(ahora.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: 2,
        activo: false,
        accesoHasta: null,
        plan: "MENSUAL",
        ultimoLogin: null,
      },
      {
        id: 3,
        activo: true,
        accesoHasta: null,
        plan: "MENSUAL",
        ultimoLogin: new Date(ahora.getTime() - 40 * 24 * 60 * 60 * 1000),
      },
      {
        id: 4,
        activo: true,
        accesoHasta: new Date(ahora.getTime() - 1 * 24 * 60 * 60 * 1000),
        plan: "MENSUAL",
        ultimoLogin: new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: 5,
        activo: true,
        accesoHasta: new Date(ahora.getTime() - 10 * 24 * 60 * 60 * 1000),
        plan: "MENSUAL",
        ultimoLogin: new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
    ] as never);
    vi.mocked(plataformaRepository.sumarPagosPorMoneda).mockResolvedValue([
      { moneda: "ARS", _sum: { monto: 25000 } },
    ] as never);

    const resultado = await plataformaService.obtenerMetricas();

    expect(resultado.totalComercios).toBe(5);
    expect(resultado.porEstado).toEqual({
      SUSPENDIDO: 1,
      SIN_VENCIMIENTO: 1,
      VIGENTE: 1,
      EN_GRACIA: 1,
      VENCIDA: 1,
    });
    expect(resultado.pruebasPorVencer7Dias).toBe(1);
    expect(resultado.sinIngreso30Dias).toBe(2);
    expect(resultado.pagosMes).toEqual([{ moneda: "ARS", total: 25000 }]);
  });
});

const USUARIO_PLATAFORMA = {
  id: 1,
  nombre: "Vendedor",
  email: "vendedor@test.com",
  password: "hash-guardado-en-bd",
  rol: "VENDEDOR" as const,
  activo: true,
  debeCambiarPassword: false,
  fechaCreacion: new Date("2025-11-01T12:00:00.000Z"),
};

describe("plataformaService.editarUsuarioComercio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(
      COMERCIO as never
    );
  });

  it("no permite desactivar al único ADMIN activo", async () => {
    vi.mocked(plataformaRepository.findUsuarioDeComercio).mockResolvedValue({
      ...USUARIO_PLATAFORMA,
      rol: "ADMIN",
    } as never);
    vi.mocked(plataformaRepository.findUsuariosActivosPorRol).mockResolvedValue([
      { id: 1 },
    ] as never);

    await expect(
      plataformaService.editarUsuarioComercio(5, 1, { activo: false }, 7, null)
    ).rejects.toThrow(ConflictError);

    expect(plataformaRepository.updateUsuario).not.toHaveBeenCalled();
    expect(plataformaRepository.crearAuditoria).not.toHaveBeenCalled();
  });

  it("no permite ascender a ADMIN si ya hay otro admin activo", async () => {
    vi.mocked(plataformaRepository.findUsuarioDeComercio).mockResolvedValue(
      USUARIO_PLATAFORMA as never
    );
    vi.mocked(plataformaRepository.findUsuariosActivosPorRol).mockResolvedValue([
      { id: 2 },
    ] as never);

    await expect(
      plataformaService.editarUsuarioComercio(5, 1, { rol: "ADMIN" }, 7, null)
    ).rejects.toThrow(ConflictError);
    expect(plataformaRepository.updateUsuario).not.toHaveBeenCalled();
  });

  it("rechaza un email duplicado dentro del comercio", async () => {
    vi.mocked(plataformaRepository.findUsuarioDeComercio).mockResolvedValue(
      USUARIO_PLATAFORMA as never
    );
    vi.mocked(plataformaRepository.findUsuarioPorEmail).mockResolvedValue({
      id: 2,
    } as never);

    await expect(
      plataformaService.editarUsuarioComercio(
        5,
        1,
        { email: "OTRO@test.com" },
        7,
        null
      )
    ).rejects.toThrow(ConflictError);

    expect(plataformaRepository.findUsuarioPorEmail).toHaveBeenCalledWith(
      5,
      "otro@test.com",
      tx
    );
    expect(plataformaRepository.updateUsuario).not.toHaveBeenCalled();
  });

  it("edita y audita antes/después sin incluir contraseñas", async () => {
    vi.mocked(plataformaRepository.findUsuarioDeComercio).mockResolvedValue(
      USUARIO_PLATAFORMA as never
    );
    vi.mocked(plataformaRepository.findUsuarioPorEmail).mockResolvedValue(null);
    vi.mocked(plataformaRepository.updateUsuario).mockResolvedValue({
      ...USUARIO_PLATAFORMA,
      nombre: "Nuevo nombre",
      email: "nuevo@test.com",
    } as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);

    const resultado = await plataformaService.editarUsuarioComercio(
      5,
      1,
      { nombre: "Nuevo nombre", email: "NUEVO@test.com" },
      7,
      "127.0.0.1"
    );

    expect(resultado.nombre).toBe("Nuevo nombre");
    expect(plataformaRepository.updateUsuario).toHaveBeenCalledWith(
      1,
      5,
      { nombre: "Nuevo nombre", email: "nuevo@test.com" },
      tx
    );

    const auditoria = vi.mocked(plataformaRepository.crearAuditoria).mock
      .calls[0][0];
    expect(auditoria.accion).toBe("EDITAR_USUARIO");
    expect(auditoria.detalle).toHaveProperty("antes");
    expect(auditoria.detalle).toHaveProperty("despues");
    expect(JSON.stringify(auditoria)).not.toContain("password");
  });
});

describe("plataformaService.resetearPasswordUsuario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(
      COMERCIO as never
    );
    vi.mocked(plataformaRepository.findUsuarioDeComercio).mockResolvedValue(
      USUARIO_PLATAFORMA as never
    );
    vi.mocked(bcrypt.hash).mockResolvedValue("hash-temporal" as never);
    vi.mocked(plataformaRepository.updateUsuario).mockResolvedValue(
      USUARIO_PLATAFORMA as never
    );
    vi.mocked(
      plataformaRepository.revocarRefreshTokensDeUsuario
    ).mockResolvedValue({ count: 1 } as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);
  });

  it("genera una temporal de 12 caracteres sin ambiguos y audita solo el usuarioId", async () => {
    const resultado = await plataformaService.resetearPasswordUsuario(
      5,
      1,
      7,
      "127.0.0.1"
    );

    expect(resultado.passwordTemporal).toHaveLength(12);
    expect(resultado.passwordTemporal).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(resultado.passwordTemporal).not.toMatch(/[0Oo1lI]/);
    expect(bcrypt.hash).toHaveBeenCalledWith(
      resultado.passwordTemporal,
      10
    );

    expect(plataformaRepository.updateUsuario).toHaveBeenCalledWith(
      1,
      5,
      { password: "hash-temporal", debeCambiarPassword: true },
      tx
    );
    expect(
      plataformaRepository.revocarRefreshTokensDeUsuario
    ).toHaveBeenCalledWith(1, tx);

    const auditoria = vi.mocked(plataformaRepository.crearAuditoria).mock
      .calls[0][0];
    expect(auditoria.accion).toBe("RESETEAR_PASSWORD");
    expect(auditoria.detalle).toEqual({ usuarioId: 1 });
    expect(JSON.stringify(auditoria)).not.toContain(
      resultado.passwordTemporal
    );
    expect(JSON.stringify(auditoria)).not.toContain("hash-temporal");
  });
});

describe("plataformaService.cargaMasivaCategorias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(
      COMERCIO as never
    );
    vi.mocked(categoriaRepository.findAllParaCargaMasiva).mockResolvedValue(
      [] as never
    );
    vi.mocked(categoriaRepository.create).mockResolvedValue({} as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);
  });

  it("rechaza menos de 1 y más de 50 filas", async () => {
    await expect(
      plataformaService.cargaMasivaCategorias(5, { categorias: [] }, 7, null)
    ).rejects.toThrow(BadRequestError);

    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({
      nombre: `Categoría ${i}`,
    }));
    await expect(
      plataformaService.cargaMasivaCategorias(
        5,
        { categorias: cincuentaYUno },
        7,
        null
      )
    ).rejects.toThrow(BadRequestError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("valida cada fila y devuelve todos los errores sin escribir", async () => {
    const resultado = await plataformaService.cargaMasivaCategorias(
      5,
      {
        categorias: [
          { nombre: "Válida" },
          { nombre: "" },
          { nombre: "Otra", descripcion: "x".repeat(201) },
        ],
      },
      7,
      null
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.errores.map((error) => error.fila)).toEqual(
        expect.arrayContaining([2, 3])
      );
      expect(resultado.errores).toHaveLength(2);
    }
    expect(categoriaRepository.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("detecta duplicados internos y contra lo ya existente", async () => {
    vi.mocked(categoriaRepository.findAllParaCargaMasiva).mockResolvedValue([
      { id: 1, nombre: "Existente" },
    ] as never);

    const resultado = await plataformaService.cargaMasivaCategorias(
      5,
      {
        categorias: [
          { nombre: "Nueva" },
          { nombre: "nueva" },
          { nombre: "existente" },
        ],
      },
      7,
      null
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.errores).toHaveLength(2);
      expect(resultado.errores[0].fila).toBe(2);
      expect(resultado.errores[1].fila).toBe(3);
    }
    expect(categoriaRepository.create).not.toHaveBeenCalled();
  });

  it("con simular valida pero no escribe ni audita", async () => {
    const resultado = await plataformaService.cargaMasivaCategorias(
      5,
      { categorias: [{ nombre: "A" }, { nombre: "B" }], simular: true },
      7,
      null
    );

    expect(resultado).toEqual({ ok: true, validas: 2, simulacion: true });
    expect(categoriaRepository.create).not.toHaveBeenCalled();
    expect(plataformaRepository.crearAuditoria).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("crea en una transacción y audita solo cantidad/simulación", async () => {
    const resultado = await plataformaService.cargaMasivaCategorias(
      5,
      { categorias: [{ nombre: "A" }, { nombre: "B" }] },
      7,
      "127.0.0.1"
    );

    expect(resultado).toEqual({ ok: true, creados: 2 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(categoriaRepository.create).toHaveBeenCalledTimes(2);
    expect(plataformaRepository.crearAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "CARGA_MASIVA_CATEGORIAS",
        detalle: { cantidad: 2, simulacion: false },
        ip: "127.0.0.1",
        superadminId: 7,
        comercioId: 5,
      }),
      tx
    );
  });
});

describe("plataformaService.cargaMasivaProductos", () => {
  const productoValido = {
    nombre: "Producto masivo",
    precioCompra: 10,
    precioVenta: 20,
    stock: 5,
    categoria: "Bebidas",
    codigoBarras: "COD-MASIVO",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(plataformaRepository.findComercioById).mockResolvedValue(
      COMERCIO as never
    );
    vi.mocked(productoRepository.findAllParaCargaMasiva).mockResolvedValue(
      [] as never
    );
    vi.mocked(categoriaRepository.findAllParaCargaMasiva).mockResolvedValue([
      { id: 3, nombre: "Bebidas" },
    ] as never);
    vi.mocked(productoRepository.create).mockResolvedValue({} as never);
    vi.mocked(plataformaRepository.crearAuditoria).mockResolvedValue({} as never);
  });

  it("valida precio y categoría inexistente por fila", async () => {
    const resultado = await plataformaService.cargaMasivaProductos(
      5,
      {
        productos: [
          { ...productoValido, precioVenta: 5 },
          { ...productoValido, nombre: "Otro", categoria: "NoExiste" },
        ],
      },
      7,
      null
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(
        resultado.errores.some((error) => error.campo === "precioVenta")
      ).toBe(true);
      expect(
        resultado.errores.some((error) => error.campo === "categoria")
      ).toBe(true);
    }
    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("detecta duplicados internos y contra lo existente", async () => {
    vi.mocked(productoRepository.findAllParaCargaMasiva).mockResolvedValue([
      { id: 9, nombre: "Existente", codigoBarras: "EXISTE" },
    ] as never);

    const resultado = await plataformaService.cargaMasivaProductos(
      5,
      {
        productos: [
          { ...productoValido, nombre: "Nuevo", codigoBarras: "COD1" },
          { ...productoValido, nombre: "nuevo", codigoBarras: "COD1" },
          {
            ...productoValido,
            nombre: "Existente",
            codigoBarras: "EXISTE",
          },
        ],
      },
      7,
      null
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.errores.some((error) => error.fila === 2)).toBe(true);
      expect(resultado.errores.some((error) => error.fila === 3)).toBe(true);
      expect(
        resultado.errores.filter((error) => error.campo === "codigoBarras")
          .length
      ).toBeGreaterThanOrEqual(2);
    }
    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("con simular valida pero no escribe ni audita", async () => {
    const resultado = await plataformaService.cargaMasivaProductos(
      5,
      { productos: [productoValido], simular: true },
      7,
      null
    );

    expect(resultado).toEqual({ ok: true, validas: 1, simulacion: true });
    expect(productoRepository.create).not.toHaveBeenCalled();
    expect(plataformaRepository.crearAuditoria).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza más de 50 productos", async () => {
    const productos = Array.from({ length: 51 }, (_, i) => ({
      ...productoValido,
      nombre: `Producto ${i}`,
      codigoBarras: `COD-${i}`,
    }));

    await expect(
      plataformaService.cargaMasivaProductos(5, { productos }, 7, null)
    ).rejects.toThrow(BadRequestError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
