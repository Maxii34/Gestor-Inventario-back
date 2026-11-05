import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { verificarVigencia, invalidarVigencia } from "./vigencia.middleware";
import { comercioRepository } from "../repositores/comercio.repository";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

vi.mock("jsonwebtoken");
vi.mock("../repositores/comercio.repository");

const MS_DIA = 24 * 60 * 60 * 1000;

const crearReq = ({
  metodo = "GET",
  ruta = "/productos",
  token = "token",
}: {
  metodo?: string;
  ruta?: string;
  token?: string | null;
} = {}) =>
  ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method: metodo,
    originalUrl: ruta,
  }) as any;

const ejecutar = async (reqFalso: any) => {
  const next = vi.fn();
  await verificarVigencia(reqFalso, {} as any, next);
  return next;
};

const conPayload = (payload: unknown = { comercioId: 1 }) => {
  vi.mocked(jwt.verify).mockReturnValue(payload as any);
};

const conComercio = (comercio: unknown) => {
  vi.mocked(comercioRepository.findById).mockResolvedValue(comercio as any);
};

const comercioVigente = (id = 1) => ({
  id,
  activo: true,
  accesoHasta: new Date(Date.now() + 5 * MS_DIA),
});

describe("verificarVigencia: tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VIGENCIA_CACHE_SEGUNDOS = "0";
    conPayload();
  });

  afterEach(() => {
    delete process.env.VIGENCIA_CACHE_SEGUNDOS;
  });

  it("sin Authorization pasa a next sin consultar el comercio", async () => {
    const next = await ejecutar(crearReq({ token: null }));

    expect(next).toHaveBeenCalledOnce();
    expect(comercioRepository.findById).not.toHaveBeenCalled();
  });

  it("con un token inválido pasa a next sin consultar el comercio", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("firma inválida");
    });

    const next = await ejecutar(crearReq());

    expect(next).toHaveBeenCalledOnce();
    expect(comercioRepository.findById).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, 1.5, "1"])(
    "con comercioId inválido (%s) pasa a next sin consultar el comercio",
    async (comercioId) => {
      conPayload({ comercioId });

      const next = await ejecutar(crearReq());

      expect(next).toHaveBeenCalledOnce();
      expect(comercioRepository.findById).not.toHaveBeenCalled();
    }
  );

  it("si el comercio no existe lanza UnauthorizedError", async () => {
    conComercio(null);

    await expect(ejecutar(crearReq())).rejects.toThrow(UnauthorizedError);
    await expect(ejecutar(crearReq())).rejects.toThrow(
      "Token inválido o expirado"
    );
  });
});

describe("verificarVigencia: estados de suscripción", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VIGENCIA_CACHE_SEGUNDOS = "0";
    conPayload();
  });

  afterEach(() => {
    delete process.env.VIGENCIA_CACHE_SEGUNDOS;
  });

  it("SUSPENDIDO lanza UnauthorizedError con el mensaje de suspensión", async () => {
    conComercio({
      id: 1,
      activo: false,
      accesoHasta: new Date(Date.now() + 5 * MS_DIA),
    });

    await expect(ejecutar(crearReq())).rejects.toThrow(UnauthorizedError);
    await expect(ejecutar(crearReq())).rejects.toThrow(
      "La cuenta está suspendida. Contactá a soporte."
    );
  });

  it("SIN_VENCIMIENTO pasa", async () => {
    conComercio({ id: 1, activo: true, accesoHasta: null });

    expect(await ejecutar(crearReq())).toHaveBeenCalledOnce();
  });

  it("VIGENTE pasa", async () => {
    conComercio(comercioVigente());

    expect(await ejecutar(crearReq())).toHaveBeenCalledOnce();
  });

  it("EN_GRACIA pasa", async () => {
    conComercio({
      id: 1,
      activo: true,
      accesoHasta: new Date(Date.now() - 1 * MS_DIA),
    });

    expect(await ejecutar(crearReq())).toHaveBeenCalledOnce();
  });

  it("VENCIDA permite leer con GET, HEAD y OPTIONS", async () => {
    conComercio({
      id: 1,
      activo: true,
      accesoHasta: new Date(Date.now() - 10 * MS_DIA),
    });

    for (const metodo of ["GET", "HEAD", "OPTIONS"]) {
      expect(await ejecutar(crearReq({ metodo }))).toHaveBeenCalledOnce();
    }
  });

  it.each(["POST", "PUT", "DELETE"])(
    "VENCIDA bloquea %s de negocio con ForbiddenError",
    async (metodo) => {
      conComercio({
        id: 1,
        activo: true,
        accesoHasta: new Date(Date.now() - 10 * MS_DIA),
      });

      await expect(ejecutar(crearReq({ metodo }))).rejects.toThrow(
        ForbiddenError
      );
      await expect(ejecutar(crearReq({ metodo }))).rejects.toThrow(
        "Tu suscripción venció: el sistema está en modo solo lectura. Contactá a soporte para renovarla."
      );
    }
  );

  it.each([
    "/usuarios/login",
    "/usuarios/refresh",
    "/usuarios/logout",
    "/usuarios/login?desde=web",
    "/usuarios/refresh/",
  ])("VENCIDA no bloquea la excepción %s", async (ruta) => {
    conComercio({
      id: 1,
      activo: true,
      accesoHasta: new Date(Date.now() - 10 * MS_DIA),
    });

    const next = await ejecutar(crearReq({ metodo: "POST", ruta }));

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("verificarVigencia: caché por comercio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conPayload();
  });

  afterEach(() => {
    delete process.env.VIGENCIA_CACHE_SEGUNDOS;
  });

  it("con TTL mayor a 0 no repite la consulta al comercio", async () => {
    process.env.VIGENCIA_CACHE_SEGUNDOS = "15";
    invalidarVigencia(501);
    conPayload({ comercioId: 501 });
    conComercio(comercioVigente(501));

    expect(await ejecutar(crearReq())).toHaveBeenCalledOnce();
    expect(await ejecutar(crearReq())).toHaveBeenCalledOnce();

    expect(comercioRepository.findById).toHaveBeenCalledTimes(1);
    expect(comercioRepository.findById).toHaveBeenCalledWith(501);
  });

  it("con TTL 0 consulta el comercio en cada request", async () => {
    process.env.VIGENCIA_CACHE_SEGUNDOS = "0";
    invalidarVigencia(502);
    conPayload({ comercioId: 502 });
    conComercio(comercioVigente(502));

    await ejecutar(crearReq());
    await ejecutar(crearReq());

    expect(comercioRepository.findById).toHaveBeenCalledTimes(2);
  });

  it("invalidarVigencia limpia la entrada cacheada", async () => {
    process.env.VIGENCIA_CACHE_SEGUNDOS = "15";
    invalidarVigencia(503);
    conPayload({ comercioId: 503 });
    conComercio(comercioVigente(503));

    await ejecutar(crearReq());
    invalidarVigencia(503);
    await ejecutar(crearReq());

    expect(comercioRepository.findById).toHaveBeenCalledTimes(2);
  });
});
