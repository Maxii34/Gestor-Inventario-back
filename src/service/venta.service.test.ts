import { describe, it, expect, vi, beforeEach } from "vitest";
import { ventaService } from "./venta.service";
import { ventaRepository } from "../repositores/venta.repository";
import { productoRepository } from "../repositores/producto.repository";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { clienteRepository } from "../repositores/cliente.repository";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors";

// vi.hoisted: crea estas funciones ANTES de que se evalúen los vi.mock de abajo.
// Es necesario porque vi.mock se "eleva" (hoist) al principio del archivo, y
// si intentáramos usar variables normales acá, todavía no existirían.
const preferenceCreateMock = vi.hoisted(() => vi.fn());
const paymentGetMock = vi.hoisted(() => vi.fn());

// Mockeamos el SDK de Mercado Pago: como el código hace "new Preference(...)"
// y "new Payment(...)", simulamos esas clases devolviendo objetos con los
// métodos .create()/.get() apuntando a los mocks de arriba, para poder
// controlar sus respuestas en cada test.
vi.mock("mercadopago", () => ({
  Preference: vi.fn().mockImplementation(function () {
    return { create: preferenceCreateMock };
  }),
  Payment: vi.fn().mockImplementation(function () {
    return { get: paymentGetMock };
  }),
}));

vi.mock("../config/mercadopago", () => ({ default: {} }));

vi.mock("../repositores/venta.repository");
vi.mock("../repositores/producto.repository");
vi.mock("../repositores/movimiento.repository");
vi.mock("../repositores/cliente.repository");
vi.mock("../config/prisma", () => ({
  prisma: { $transaction: vi.fn((callback) => callback({})) },
}));

const productoFalso = {
  id: 1,
  nombre: "Producto Test",
  precioVenta: 200,
  stock: 10,
} as any;

describe("ventaService.iniciarVenta - EFECTIVO (venta directa)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si algún producto no existe", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(null);

    await expect(
      ventaService.iniciarVenta({
        metodoPago: "EFECTIVO",
        detalles: [{ productoId: 999, cantidad: 1 }],
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("lanza ConflictError si no hay stock suficiente", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10

    await expect(
      ventaService.iniciarVenta({
        metodoPago: "EFECTIVO",
        detalles: [{ productoId: 1, cantidad: 999 }],
      })
    ).rejects.toThrow(ConflictError);

    // Nunca se llega a crear la venta si la validación falla antes
    expect(ventaRepository.create).not.toHaveBeenCalled();
  });

  it("completa la venta al instante, sin generar link de pago", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso);
    vi.mocked(productoRepository.update).mockResolvedValue(productoFalso);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);
    vi.mocked(ventaRepository.create).mockResolvedValue({ id: 10 } as any);

    const resultado = await ventaService.iniciarVenta({
      metodoPago: "EFECTIVO",
      detalles: [{ productoId: 1, cantidad: 2 }],
    });

    // La clave de este bloque: confirmar que NO se llamó a Mercado Pago
    expect(preferenceCreateMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ ventaId: 10, initPoint: null });

    // La venta se crea directamente como COMPLETADA
    expect(ventaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "COMPLETADA" }),
      expect.anything()
    );
  });
});

describe("ventaService.iniciarVenta - PEDIDO_DISTANCIA (Mercado Pago)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea la venta, genera la preferencia y devuelve el link de pago", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso);
    vi.mocked(ventaRepository.create).mockResolvedValue({ id: 42 } as any);
    vi.mocked(ventaRepository.update).mockResolvedValue({} as any);
    preferenceCreateMock.mockResolvedValue({
      id: "pref-abc",
      init_point: "https://www.mercadopago.com/checkout/abc",
    });

    const resultado = await ventaService.iniciarVenta({
      metodoPago: "PEDIDO_DISTANCIA",
      detalles: [{ productoId: 1, cantidad: 1 }],
    });

    // La preferencia se creó usando el id de la venta como referencia
    expect(preferenceCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ external_reference: "42" }),
      })
    );

    // Se guarda el preferenceId en la venta para trazabilidad
    expect(ventaRepository.update).toHaveBeenCalledWith(42, {
      mercadoPagoPreferenceId: "pref-abc",
    });

    expect(resultado).toEqual({
      ventaId: 42,
      initPoint: "https://www.mercadopago.com/checkout/abc",
    });
  });
});

describe("ventaService.confirmarPago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza BadRequestError si el pago no tiene external_reference válida", async () => {
    paymentGetMock.mockResolvedValue({ external_reference: "no-es-numero" });

    await expect(ventaService.confirmarPago("pay-1")).rejects.toThrow(BadRequestError);
  });

  it("lanza NotFoundError si la venta no existe", async () => {
    paymentGetMock.mockResolvedValue({ external_reference: "42" });
    vi.mocked(ventaRepository.findById).mockResolvedValue(null);

    await expect(ventaService.confirmarPago("pay-1")).rejects.toThrow(NotFoundError);
  });

  it("no hace nada si la venta ya no está PENDIENTE (webhook duplicado)", async () => {
    paymentGetMock.mockResolvedValue({ external_reference: "42", status: "approved" });
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 42,
      estado: "COMPLETADA", // ya procesada antes
      detalles: [],
    } as any);

    await ventaService.confirmarPago("pay-1");

    // No se vuelve a tocar stock ni a actualizar la venta
    expect(productoRepository.update).not.toHaveBeenCalled();
    expect(ventaRepository.update).not.toHaveBeenCalled();
  });

  it("con pago aprobado: descuenta stock, crea movimiento y completa la venta", async () => {
    paymentGetMock.mockResolvedValue({ id: "pay-1", external_reference: "42", status: "approved" });
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 42,
      estado: "PENDIENTE",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any);
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10
    vi.mocked(productoRepository.update).mockResolvedValue(productoFalso);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);
    vi.mocked(ventaRepository.update).mockResolvedValue({ id: 42, estado: "COMPLETADA" } as any);

    await ventaService.confirmarPago("pay-1");

    // 10 - 2 = 8
    expect(productoRepository.update).toHaveBeenCalledWith(1, { stock: 8 }, expect.anything());
    expect(ventaRepository.update).toHaveBeenCalledWith(
      42,
      { estado: "COMPLETADA", mercadoPagoPaymentId: "pay-1" },
      expect.anything()
    );
  });

  it("con pago rechazado: marca la venta como RECHAZADA sin tocar stock", async () => {
    paymentGetMock.mockResolvedValue({ id: "pay-2", external_reference: "42", status: "rejected" });
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 42,
      estado: "PENDIENTE",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any);
    vi.mocked(ventaRepository.update).mockResolvedValue({ id: 42, estado: "RECHAZADA" } as any);

    await ventaService.confirmarPago("pay-2");

    expect(productoRepository.update).not.toHaveBeenCalled();
    expect(ventaRepository.update).toHaveBeenCalledWith(42,{
      estado: "RECHAZADA",
      mercadoPagoPaymentId: "pay-2",
    });
  });
});

describe("ventaService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si la venta no existe", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue(null);

    await expect(ventaService.update(999, {})).rejects.toThrow(NotFoundError);
  });

  it("lanza NotFoundError si el cliente indicado no existe", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({ id: 1 } as any);
    vi.mocked(clienteRepository.findById).mockResolvedValue(null);

    await expect(ventaService.update(1, { clienteId: 999 })).rejects.toThrow(NotFoundError);
  });
});

describe("ventaService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si la venta no existe", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue(null);

    await expect(ventaService.delete(999)).rejects.toThrow(NotFoundError);
  });
});