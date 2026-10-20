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
      }, 1, 1)
    ).rejects.toThrow(NotFoundError);
  });

  it("lanza ConflictError si no hay stock suficiente", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10

    await expect(
      ventaService.iniciarVenta({
        metodoPago: "EFECTIVO",
        detalles: [{ productoId: 1, cantidad: 999 }],
      }, 1, 1)
    ).rejects.toThrow(ConflictError);

    // Nunca se llega a crear la venta si la validación falla antes
    expect(ventaRepository.create).not.toHaveBeenCalled();
  });

  it("completa la venta al instante, sin generar link de pago", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);
    vi.mocked(ventaRepository.create).mockResolvedValue({ id: 10 } as any);

    const resultado = await ventaService.iniciarVenta({
      metodoPago: "EFECTIVO",
      detalles: [{ productoId: 1, cantidad: 2 }],
    }, 1, 1);

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
    }, 1, 1);

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
    vi.mocked(ventaRepository.findByIdGlobal).mockResolvedValue(null);

    await expect(ventaService.confirmarPago("pay-1")).rejects.toThrow(NotFoundError);
  });

  it("no hace nada si la venta ya no está PENDIENTE (webhook duplicado)", async () => {
    paymentGetMock.mockResolvedValue({ external_reference: "42", status: "approved" });
    vi.mocked(ventaRepository.findByIdGlobal).mockResolvedValue({
      id: 42,
      comercioId: 1,
      estado: "COMPLETADA", // ya procesada antes
      detalles: [],
    } as any);

    await ventaService.confirmarPago("pay-1");

    // No se vuelve a tocar stock ni a actualizar la venta (ni siquiera el claim)
    expect(productoRepository.update).not.toHaveBeenCalled();
    expect(productoRepository.updateMany).not.toHaveBeenCalled();
    expect(ventaRepository.update).not.toHaveBeenCalled();
    expect(ventaRepository.updateMany).not.toHaveBeenCalled();
  });

  it("con pago aprobado: reclama la transición, descuenta atómico y completa la venta", async () => {
    paymentGetMock.mockResolvedValue({ id: "pay-1", external_reference: "42", status: "approved" });
    vi.mocked(ventaRepository.findByIdGlobal).mockResolvedValue({
      id: 42,
      comercioId: 1,
      estado: "PENDIENTE",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any);
    vi.mocked(productoRepository.findById).mockResolvedValue({ ...productoFalso, stock: 8 } as any); // post-descuento: 10 - 2
    vi.mocked(ventaRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    await ventaService.confirmarPago("pay-1");

    // Claim condicional PENDIENTE → COMPLETADA con el paymentId, acotado al comercio
    expect(ventaRepository.updateMany).toHaveBeenCalledWith(
      { id: 42, comercioId: 1, estado: "PENDIENTE" },
      { estado: "COMPLETADA", mercadoPagoPaymentId: "pay-1" },
      expect.anything()
    );
    // Descuento atómico y condicional
    expect(productoRepository.updateMany).toHaveBeenCalledWith(
      { id: 1, comercioId: 1, stock: { gte: 2 } },
      { stock: { decrement: 2 } },
      expect.anything()
    );
    // Movimiento con valores post-escritura: anterior 10, nuevo 8
    expect(movimientoRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "SALIDA",
        cantidad: 2,
        stockAnterior: 10,
        stockNuevo: 8,
      }),
      expect.anything()
    );
    expect(productoRepository.update).not.toHaveBeenCalled();
  });

  it("con pago aprobado sin stock: aborta con 409 sin completar ni crear movimiento", async () => {
    paymentGetMock.mockResolvedValue({ id: "pay-1", external_reference: "42", status: "approved" });
    vi.mocked(ventaRepository.findByIdGlobal).mockResolvedValue({
      id: 42,
      comercioId: 1,
      estado: "PENDIENTE",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any);
    vi.mocked(ventaRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(productoRepository.findById).mockResolvedValue({ ...productoFalso, stock: 1 } as any);

    await expect(ventaService.confirmarPago("pay-1")).rejects.toThrow(ConflictError);
    expect(movimientoRepository.create).not.toHaveBeenCalled();
  });

  it("con pago rechazado: marca la venta como RECHAZADA sin tocar stock", async () => {
    paymentGetMock.mockResolvedValue({ id: "pay-2", external_reference: "42", status: "rejected" });
    vi.mocked(ventaRepository.findByIdGlobal).mockResolvedValue({
      id: 42,
      comercioId: 1,
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

    await expect(ventaService.update(999, 1, {})).rejects.toThrow(NotFoundError);
  });

  it("lanza NotFoundError si el cliente indicado no existe", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({ id: 1 } as any);
    vi.mocked(clienteRepository.findById).mockResolvedValue(null);

    await expect(ventaService.update(1, 1, { clienteId: 999 })).rejects.toThrow(NotFoundError);
  });
});

describe("ventaService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si la venta no existe", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue(null);

    await expect(ventaService.delete(999, 1)).rejects.toThrow(NotFoundError);
  });

  it("prohíbe el borrado físico de una venta COMPLETADA (409, sin borrar nada)", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "COMPLETADA",
      detalles: [],
    } as any);

    await expect(ventaService.delete(1, 1)).rejects.toThrow(ConflictError);
    expect(ventaRepository.delete).not.toHaveBeenCalled();
  });

  it("prohíbe el borrado físico de una venta PENDIENTE (409)", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "PENDIENTE",
      detalles: [],
    } as any);

    await expect(ventaService.delete(1, 1)).rejects.toThrow(ConflictError);
    expect(ventaRepository.delete).not.toHaveBeenCalled();
  });
});

describe("ventaService.update - máquina de estados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza completar manualmente una venta PENDIENTE (409)", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "PENDIENTE",
      detalles: [],
    } as any);

    await expect(ventaService.update(1, 1, { estado: "COMPLETADA" })).rejects.toThrow(
      ConflictError
    );
    expect(ventaRepository.update).not.toHaveBeenCalled();
  });

  it("rechaza anular por PUT: indica usar la operación explícita (409)", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "PENDIENTE",
      detalles: [],
    } as any);

    await expect(ventaService.update(1, 1, { estado: "ANULADA" })).rejects.toThrow(
      ConflictError
    );
    expect(ventaRepository.update).not.toHaveBeenCalled();
  });

  it("rechaza cambiar el método de pago de una venta PENDIENTE (409)", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "PENDIENTE",
      detalles: [],
    } as any);

    await expect(
      ventaService.update(1, 1, { metodoPago: "EFECTIVO" as never })
    ).rejects.toThrow(ConflictError);
  });

  it("rechaza cualquier modificación de una venta COMPLETADA (409)", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "COMPLETADA",
      detalles: [],
    } as any);
    vi.mocked(clienteRepository.findById).mockResolvedValue({ id: 2 } as any);

    await expect(ventaService.update(1, 1, { clienteId: 2 })).rejects.toThrow(ConflictError);
    expect(ventaRepository.update).not.toHaveBeenCalled();
  });

  it("rechaza modificaciones desde estados finales ANULADA/RECHAZADA (409)", async () => {
    vi.mocked(clienteRepository.findById).mockResolvedValue({ id: 2 } as any);
    for (const estado of ["ANULADA", "RECHAZADA"]) {
      vi.mocked(ventaRepository.findById).mockResolvedValue({ id: 1, estado } as any);
      await expect(ventaService.update(1, 1, { clienteId: 2 })).rejects.toThrow(
        ConflictError
      );
    }
    expect(ventaRepository.update).not.toHaveBeenCalled();
  });

  it("permite reasignar cliente en una venta PENDIENTE", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "PENDIENTE",
      detalles: [],
    } as any);
    vi.mocked(clienteRepository.findById).mockResolvedValue({ id: 2 } as any);
    vi.mocked(ventaRepository.update).mockResolvedValue({ id: 1 } as any);

    await ventaService.update(1, 1, { clienteId: 2 });
    expect(ventaRepository.update).toHaveBeenCalledWith(1, { clienteId: 2 });
  });
});

describe("ventaService.anular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si la venta no existe", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue(null);

    await expect(ventaService.anular(999, 1, "motivo", 1)).rejects.toThrow(NotFoundError);
  });

  it("exige motivo no vacío (400)", async () => {
    await expect(ventaService.anular(1, 1, "   ", 1)).rejects.toThrow(BadRequestError);
    expect(ventaRepository.findById).not.toHaveBeenCalled();
  });

  it("rechaza anular desde estados finales ANULADA/RECHAZADA (409)", async () => {
    for (const estado of ["ANULADA", "RECHAZADA"]) {
      vi.mocked(ventaRepository.findById).mockResolvedValue({ id: 1, estado } as any);
      await expect(ventaService.anular(1, 1, "duplicada", 1)).rejects.toThrow(ConflictError);
    }
    expect(ventaRepository.update).not.toHaveBeenCalled();
    expect(ventaRepository.updateMany).not.toHaveBeenCalled();
  });

  it("anula una venta PENDIENTE sin tocar stock", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue({
      id: 1,
      estado: "PENDIENTE",
      detalles: [],
    } as any);
    vi.mocked(ventaRepository.update).mockResolvedValue({ id: 1, estado: "ANULADA" } as any);

    const resultado = await ventaService.anular(1, 1, "el cliente canceló", 7);
    expect(ventaRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({
      estado: "ANULADA",
      motivoAnulacion: "el cliente canceló",
      anuladoPor: { connect: { id: 7 } },
    }));
    expect(productoRepository.update).not.toHaveBeenCalled();
    expect(movimientoRepository.create).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: 1, estado: "ANULADA" });
  });

  it("anula una venta COMPLETADA reponiendo stock con movimientos ENTRADA", async () => {
    const venta = {
      id: 1,
      estado: "COMPLETADA",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any;
    vi.mocked(ventaRepository.findById).mockResolvedValue(venta);
    vi.mocked(productoRepository.findById).mockResolvedValue({ ...productoFalso } as any);
    vi.mocked(ventaRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    // Registro devuelto post-incremento: 10 + 2 = 12
    vi.mocked(productoRepository.update).mockResolvedValue({ ...productoFalso, stock: 12 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    await ventaService.anular(1, 1, "devolución", 7);

    expect(ventaRepository.updateMany).toHaveBeenCalledWith(
      { id: 1, comercioId: 1, estado: "COMPLETADA" },
      expect.objectContaining({ estado: "ANULADA", anuladoPor: { connect: { id: 7 } } }),
      expect.anything()
    );
    expect(productoRepository.update).toHaveBeenCalledWith(
      1,
      { stock: { increment: 2 } },
      expect.anything()
    );
    expect(movimientoRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "ENTRADA",
        cantidad: 2,
        stockAnterior: 10,
        stockNuevo: 12,
        motivo: "Anulación venta #1: devolución",
      }),
      expect.anything()
    );
  });

  it("si falla la compensación, el error propaga y no hay escrituras fuera de la transacción", async () => {
    const venta = {
      id: 1,
      estado: "COMPLETADA",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any;
    vi.mocked(ventaRepository.findById).mockResolvedValue(venta);
    vi.mocked(productoRepository.findById).mockResolvedValue({ ...productoFalso } as any);
    vi.mocked(ventaRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(productoRepository.update).mockResolvedValue({} as any);
    vi.mocked(movimientoRepository.create).mockRejectedValue(new Error("fallo de BD"));

    await expect(ventaService.anular(1, 1, "devolucion", 7)).rejects.toThrow("fallo de BD");
    // Nada fuera de la transacción: la atomicidad real la da el rollback de Prisma.
    expect(ventaRepository.update).not.toHaveBeenCalled();
    expect(ventaRepository.delete).not.toHaveBeenCalled();
  });

  it("dos anulaciones concurrentes compensan una sola vez (la segunda recibe 409)", async () => {
    let estado = "COMPLETADA";
    const ventaBase = {
      id: 1,
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any;
    vi.mocked(ventaRepository.findById).mockImplementation((async () => ({
      ...ventaBase,
      estado,
    })) as any);
    vi.mocked(productoRepository.findById).mockResolvedValue({ ...productoFalso } as any);
    vi.mocked(ventaRepository.updateMany).mockImplementation((async (where: any) => {
      if (where?.estado === "COMPLETADA" && estado === "COMPLETADA") {
        estado = "ANULADA";
        return { count: 1 } as any;
      }
      return { count: 0 } as any;
    }) as any);
    vi.mocked(productoRepository.update).mockResolvedValue({ ...productoFalso, stock: 12 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    const [r1, r2] = await Promise.allSettled([
      ventaService.anular(1, 1, "doble clic", 1),
      ventaService.anular(1, 1, "doble clic", 1),
    ]);

    const exitos = [r1, r2].filter((r) => r.status === "fulfilled");
    const conflictos = [r1, r2].filter(
      (r) => r.status === "rejected" && (r as PromiseRejectedResult).reason instanceof ConflictError
    );
    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(1);
    expect(movimientoRepository.create).toHaveBeenCalledTimes(1);
    expect(productoRepository.update).toHaveBeenCalledTimes(1);
  });
});

describe("webhook repetido: no descuenta stock dos veces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("segunda notificación approved sobre venta ya COMPLETADA no toca stock", async () => {
    let estado = "PENDIENTE";
    paymentGetMock.mockResolvedValue({
      id: "pay-1",
      external_reference: "7",
      status: "approved",
    });
    vi.mocked(ventaRepository.findByIdGlobal).mockImplementation(((id: number) =>
      Promise.resolve(
        id === 7
          ? { id: 7, comercioId: 1, estado, detalles: [{ productoId: 1, cantidad: 2 }] }
          : { ...productoFalso, stock: 8 }
      )) as any);
    vi.mocked(ventaRepository.updateMany).mockImplementation((async () => {
      estado = "COMPLETADA";
      return { count: 1 };
    }) as any);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    await ventaService.confirmarPago("pay-1");
    await ventaService.confirmarPago("pay-1");

    expect(paymentGetMock).toHaveBeenCalledTimes(2);
    // Un solo claim, un solo descuento, un solo movimiento SALIDA
    expect(ventaRepository.updateMany).toHaveBeenCalledTimes(1);
    expect(productoRepository.updateMany).toHaveBeenCalledTimes(1);
    expect(movimientoRepository.create).toHaveBeenCalledTimes(1);
    expect(productoRepository.update).not.toHaveBeenCalled();
  });

  it("dos webhooks simultáneos para la misma venta: un solo descuento", async () => {
    let estado = "PENDIENTE";
    paymentGetMock.mockResolvedValue({
      id: "pay-9",
      external_reference: "9",
      status: "approved",
    });
    vi.mocked(ventaRepository.findByIdGlobal).mockImplementation(((id: number) =>
      Promise.resolve(
        id === 9
          ? { id: 9, comercioId: 1, estado, detalles: [{ productoId: 1, cantidad: 2 }] }
          : { ...productoFalso, stock: 8 }
      )) as any);
    // Solo el primer claim concurrente es concedido (como en PG con row lock)
    vi.mocked(ventaRepository.updateMany).mockImplementation((async (where: any) => {
      if (where?.estado === "PENDIENTE" && estado === "PENDIENTE") {
        estado = "COMPLETADA";
        return { count: 1 };
      }
      return { count: 0 };
    }) as any);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    const [r1, r2] = await Promise.allSettled([
      ventaService.confirmarPago("pay-9"),
      ventaService.confirmarPago("pay-9"),
    ]);

    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("fulfilled");
    expect(productoRepository.updateMany).toHaveBeenCalledTimes(1);
    expect(movimientoRepository.create).toHaveBeenCalledTimes(1);
  });

  it("fallo posterior al claim: no queda completada parcial ni movimientos huérfanos", async () => {
    paymentGetMock.mockResolvedValue({ id: "pay-3", external_reference: "11", status: "approved" });
    vi.mocked(ventaRepository.findByIdGlobal).mockResolvedValue({
      id: 11,
      comercioId: 1,
      estado: "PENDIENTE",
      detalles: [{ productoId: 1, cantidad: 2 }],
    } as any);
    vi.mocked(ventaRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(productoRepository.findById).mockResolvedValue({ ...productoFalso, stock: 8 } as any);
    vi.mocked(movimientoRepository.create).mockRejectedValue(new Error("fallo de BD"));

    await expect(ventaService.confirmarPago("pay-3")).rejects.toThrow("fallo de BD");
    // La atomicidad real la da el rollback del tx (incluye el claim); acá se
    // verifica que el error propaga y no hay escrituras fuera de la transacción.
    expect(ventaRepository.update).not.toHaveBeenCalled();
    expect(ventaRepository.delete).not.toHaveBeenCalled();
  });

  it("dos ventas directas concurrentes no generan stock negativo ni pierden updates", async () => {
    let stock = 3;
    vi.mocked(productoRepository.findById).mockImplementation(((id: number) =>
      Promise.resolve(
        id === 1 ? { ...productoFalso, nombre: "P", stock } : null
      )) as any);
    // Simula PG: decrement condicional atómico y serializado
    vi.mocked(productoRepository.updateMany).mockImplementation((async () => {
      if (stock >= 2) {
        stock -= 2;
        return { count: 1 };
      }
      return { count: 0 };
    }) as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);
    vi.mocked(ventaRepository.create).mockResolvedValue({ id: 20 } as any);

    const [r1, r2] = await Promise.allSettled([
      ventaService.iniciarVenta({ metodoPago: "EFECTIVO", detalles: [{ productoId: 1, cantidad: 2 }] }, 1, 1),
      ventaService.iniciarVenta({ metodoPago: "EFECTIVO", detalles: [{ productoId: 1, cantidad: 2 }] }, 1, 1),
    ]);

    const exitos = [r1, r2].filter((r) => r.status === "fulfilled");
    const conflictos = [r1, r2].filter(
      (r) => r.status === "rejected" && (r as PromiseRejectedResult).reason instanceof ConflictError
    );
    // stock 3 solo alcanza para una venta de 2 (3-2=1 < 2 para la segunda)
    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(1);
    expect(stock).toBe(1);
    expect(movimientoRepository.create).toHaveBeenCalledTimes(1);
  });
});
describe("ventaService aislamiento por comercio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no inicia venta con producto de otro comercio (404, sin crear nada)", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(null);

    await expect(
      ventaService.iniciarVenta(
        { metodoPago: "EFECTIVO", detalles: [{ productoId: 9, cantidad: 1 }] },
        2,
        1
      )
    ).rejects.toThrow(NotFoundError);
    expect(productoRepository.findById).toHaveBeenCalledWith(9, 2);
    expect(ventaRepository.create).not.toHaveBeenCalled();
    expect(movimientoRepository.create).not.toHaveBeenCalled();
  });

  it("no inicia venta con cliente de otro comercio (404)", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso);
    vi.mocked(clienteRepository.findById).mockResolvedValue(null);

    await expect(
      ventaService.iniciarVenta(
        { metodoPago: "EFECTIVO", clienteId: 9, detalles: [{ productoId: 1, cantidad: 1 }] },
        2,
        1
      )
    ).rejects.toThrow(NotFoundError);
    expect(clienteRepository.findById).toHaveBeenCalledWith(9, 2);
    expect(ventaRepository.create).not.toHaveBeenCalled();
  });

  it("registra al vendedor y al comercio en la venta directa", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso);
    vi.mocked(productoRepository.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);
    vi.mocked(ventaRepository.create).mockResolvedValue({ id: 10 } as any);

    await ventaService.iniciarVenta(
      { metodoPago: "EFECTIVO", detalles: [{ productoId: 1, cantidad: 2 }] },
      2,
      5
    );

    expect(ventaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        comercio: { connect: { id: 2 } },
        vendedor: { connect: { id: 5 } },
      }),
      expect.anything()
    );
  });

  it("getById de otro comercio responde 404 sin filtrar existencia", async () => {
    vi.mocked(ventaRepository.findById).mockResolvedValue(null);

    await expect(ventaService.getById(1, 2)).rejects.toThrow(NotFoundError);
    expect(ventaRepository.findById).toHaveBeenCalledWith(1, 2);
  });
});
