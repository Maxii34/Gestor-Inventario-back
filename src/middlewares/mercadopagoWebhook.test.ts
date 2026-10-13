import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  verificarFirmaMercadoPago,
  MpWebhookRequest,
} from "./mercadopagoWebhook";
import { AppError, UnauthorizedError } from "../utils/errors";

// El secreto solo vive en el entorno del test, nunca hardcodeado en código real.
const SECRETO_TEST = "secreto-webhook-de-prueba";
const REQUEST_ID = "request-id-de-prueba";
const DATA_ID = "999999999";
const TS = "1704908010";

// Manifiesto oficial MP (verificado en el SDK instalado): "id:{...};request-id:{...};ts:{...};"
const firmar = (dataId: string | undefined, secreto: string) => {
  const partes: string[] = [];
  if (dataId) partes.push(`id:${dataId}`);
  partes.push(`request-id:${REQUEST_ID}`);
  partes.push(`ts:${TS}`);
  const manifiesto = partes.join(";") + ";";
  const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return `ts=${TS},v1=${v1}`;
};

const armarReq = (opciones: {
  body?: unknown;
  query?: Record<string, unknown>;
  xSignature?: string;
}): MpWebhookRequest =>
  ({
    body: opciones.body ?? {},
    query: opciones.query ?? {},
    headers: {
      ...(opciones.xSignature ? { "x-signature": opciones.xSignature } : {}),
      "x-request-id": REQUEST_ID,
    },
  }) as unknown as MpWebhookRequest;

describe("verificarFirmaMercadoPago", () => {
  const OLD = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO_TEST;
  });

  afterEach(() => {
    if (OLD === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = OLD;
  });

  it("firma válida (body.data.id) deja pasar y fija mpDataId", () => {
    const req = armarReq({
      body: { type: "payment", data: { id: DATA_ID } },
      xSignature: firmar(DATA_ID, SECRETO_TEST),
    });
    const next = vi.fn();
    verificarFirmaMercadoPago(req, {} as never, next as never);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mpDataId).toBe(DATA_ID);
  });

  it("firma válida vía query data.id deja pasar", () => {
    const req = armarReq({
      body: {},
      query: { "data.id": DATA_ID },
      xSignature: firmar(DATA_ID, SECRETO_TEST),
    });
    const next = vi.fn();
    verificarFirmaMercadoPago(req, {} as never, next as never);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mpDataId).toBe(DATA_ID);
  });

  it("firma inválida (otro secreto) rechaza con 401 y no llama next", () => {
    const req = armarReq({
      body: { type: "payment", data: { id: DATA_ID } },
      xSignature: firmar(DATA_ID, "secreto-equivocado"),
    });
    const next = vi.fn();
    try {
      verificarFirmaMercadoPago(req, {} as never, next as never);
      expect.unreachable("debió lanzar UnauthorizedError");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
    expect(req.mpDataId).toBeUndefined();
  });

  it("firma ausente en notificación de pago rechaza con 401", () => {
    const req = armarReq({
      body: { type: "payment", data: { id: DATA_ID } },
    });
    const next = vi.fn();
    try {
      verificarFirmaMercadoPago(req, {} as never, next as never);
      expect.unreachable("debió lanzar UnauthorizedError");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as AppError).statusCode).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("secreto no configurado rechaza con 503 (fail-closed) sin llamar next", () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const req = armarReq({
      body: { type: "payment", data: { id: DATA_ID } },
      xSignature: firmar(DATA_ID, SECRETO_TEST),
    });
    const next = vi.fn();
    try {
      verificarFirmaMercadoPago(req, {} as never, next as never);
      expect.unreachable("debió lanzar AppError 503");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(503);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("ruido sin dataId ni firma pasa (el controller responde 200 sin mutar)", () => {
    const req = armarReq({ body: { type: "otro" } });
    const next = vi.fn();
    verificarFirmaMercadoPago(req, {} as never, next as never);
    expect(next).toHaveBeenCalledOnce();
  });
});
