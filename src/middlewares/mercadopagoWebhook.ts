import { Request, Response, NextFunction } from "express";
import { WebhookSignatureValidator } from "mercadopago";
import { AppError, UnauthorizedError } from "../utils/errors";

// Verificación de autenticidad del webhook de Mercado Pago (Checkout Pro).
//
// Patrón oficial (docs "Webhooks > Validate notification origin" + SDK mercadopago
// `WebhookSignatureValidator`, verificado en la v3.6.0 instalada):
//   - MP firma cada notificación con HMAC-SHA256 usando el secreto de la app
//     ("Tus integraciones > Webhooks", variable MERCADOPAGO_WEBHOOK_SECRET).
//   - La firma viaja en el header `x-signature: ts=...,v1=...` junto a `x-request-id`.
//   - El manifiesto firmado es `id:{dataId};request-id:{xRequestId};ts:{ts};`
//     donde `dataId` es el query param `data.id` (se acepta también `id` y, como
//     respaldo, `body.data.id`, que es lo que usa hoy `ventaController.webhook`).
//   - La comparación es en tiempo constante (la hace el SDK).
//
// Comportamiento:
//   - Sin MERCADOPAGO_WEBHOOK_SECRET configurado: se rechaza TODO con 503
//     (fail-closed: nunca se acepta una notificación como auténtica) pero la API
//     arranca igual; el secreto solo es obligatorio cuando se habilita esta integración.
//   - Notificación accionable (trae algún dataId) sin firma o con firma inválida: 401,
//     no se procesa el pago y MP reintentará.
//   - Ruido sin dataId ni firma (ej: pings no accionables): pasa y el controller
//     responde 200 sin mutar nada, como antes.
//   - Firma válida: pasa y deja el id firmado en `req.mpDataId` para que el controller
//     procese exactamente el valor autenticado, no un body manipulado.

export interface MpWebhookRequest extends Request {
  mpDataId?: string;
}

const extraerDataIds = (req: Request): string[] => {
  const candidatos: unknown[] = [
    (req.query as Record<string, unknown>)?.["data.id"],
    (req.query as Record<string, unknown>)?.id,
    (req.body as { data?: { id?: unknown } } | undefined)?.data?.id,
  ];
  const vistos = new Set<string>();
  const ids: string[] = [];
  for (const candidato of candidatos) {
    if (candidato === undefined || candidato === null) continue;
    const texto = String(candidato).trim();
    if (!texto || vistos.has(texto)) continue;
    vistos.add(texto);
    ids.push(texto);
  }
  return ids;
};

export const verificarFirmaMercadoPago = (
  req: MpWebhookRequest,
  _res: Response,
  next: NextFunction
) => {
  // Se lee en cada request (no al importar) para no romper el arranque de la API
  // cuando la integración con MP aún no está configurada.
  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secreto) {
    throw new AppError(
      "Integración de Mercado Pago no configurada: falta MERCADOPAGO_WEBHOOK_SECRET",
      503
    );
  }

  const dataIds = extraerDataIds(req);
  const xSignature = req.headers["x-signature"];
  const xRequestId = req.headers["x-request-id"];

  if (dataIds.length === 0 && !xSignature) {
    return next();
  }

  // Se acepta el primer candidato cuyo HMAC verifique. Probar varios dataId no
  // debilita la firma: cada intento exige el HMAC correcto con el secreto.
  const intentos = dataIds.length > 0 ? dataIds : [undefined as unknown as string];
  let ultimoError: unknown;
  for (const dataId of intentos) {
    try {
      WebhookSignatureValidator.validate({
        xSignature: xSignature as string | string[] | undefined,
        xRequestId: xRequestId as string | string[] | undefined,
        dataId: dataId as string | undefined,
        secret: secreto,
      });
      if (dataId) {
        req.mpDataId = dataId;
      }
      return next();
    } catch (error) {
      ultimoError = error;
    }
  }

  const motivo = (ultimoError as { reason?: string } | undefined)?.reason ?? "desconocido";
  console.warn(`[webhook MP] firma rechazada (motivo: ${motivo})`);
  throw new UnauthorizedError("Firma de Mercado Pago inválida");
};
