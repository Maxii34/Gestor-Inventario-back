import { describe, it, expect, vi, beforeEach } from "vitest";
import { movimientoService } from "./movimiento.service";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { productoRepository } from "../repositores/producto.repository";
import { NotFoundError, ConflictError } from "../utils/errors";

// Mockeamos los repositories y el prisma: los tests de service NO tocan
// la base de datos real, solo verifican la lógica de negocio.
vi.mock("../repositores/movimiento.repository");
vi.mock("../repositores/producto.repository");
vi.mock("../config/prisma", () => ({
  // Simulamos $transaction: en vez de abrir una transacción real,
  // simplemente ejecuta la función que le pasamos, con un "tx" falso.
  prisma: {
    $transaction: vi.fn((callback) => callback({})),
  },
}));

// Objeto de producto reutilizable para varios tests, con stock inicial de 10.
const productoFalso = {
  id: 1,
  nombre: "Producto Test",
  descripcion: null,
  precioCompra: 100,
  precioVenta: 200,
  stock: 10,
  stockMinimo: 2,
  activo: true,
  categoriaId: 1,
  fechaCreacion: new Date(),
  fechaActualizacion: new Date(),
} as any;

describe("movimientoService.create", () => {
  // Antes de cada test, limpiamos el historial de llamadas de los mocks,
  // para que un test no "contamine" el conteo de llamadas del siguiente.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el producto no existe", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(null);

    await expect(
      movimientoService.create({ tipo: "ENTRADA", cantidad: 5, productoId: 999 })
    ).rejects.toThrow(NotFoundError);
  });

  it("lanza ConflictError si la SALIDA supera el stock disponible", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10

    await expect(
      movimientoService.create({ tipo: "SALIDA", cantidad: 999, productoId: 1 })
    ).rejects.toThrow(ConflictError);

    // Confirmamos que, al fallar la validación, NUNCA se llegó a tocar la
    // base de datos (ni update de stock ni create de movimiento).
    expect(productoRepository.update).not.toHaveBeenCalled();
    expect(movimientoRepository.create).not.toHaveBeenCalled();
  });

  it("calcula correctamente el stockNuevo en una ENTRADA", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10
    vi.mocked(productoRepository.update).mockResolvedValue(productoFalso);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    await movimientoService.create({ tipo: "ENTRADA", cantidad: 5, productoId: 1 });

    // 10 + 5 = 15
    expect(productoRepository.update).toHaveBeenCalledWith(
      1,
      { stock: 15 },
      expect.anything() // el "tx" falso que le pasamos
    );
  });

  it("calcula correctamente el stockNuevo en una SALIDA válida", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10
    vi.mocked(productoRepository.update).mockResolvedValue(productoFalso);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    await movimientoService.create({ tipo: "SALIDA", cantidad: 3, productoId: 1 });

    // 10 - 3 = 7
    expect(productoRepository.update).toHaveBeenCalledWith(
      1,
      { stock: 7 },
      expect.anything()
    );
  });

  it("en un AJUSTE, el stockNuevo es directamente la cantidad indicada", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(productoFalso); // stock: 10
    vi.mocked(productoRepository.update).mockResolvedValue(productoFalso);
    vi.mocked(movimientoRepository.create).mockResolvedValue({} as any);

    await movimientoService.create({ tipo: "AJUSTE", cantidad: 50, productoId: 1 });

    expect(productoRepository.update).toHaveBeenCalledWith(
      1,
      { stock: 50 },
      expect.anything()
    );
  });
});

describe("movimientoService.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el movimiento no existe", async () => {
    vi.mocked(movimientoRepository.findById).mockResolvedValue(null);

    await expect(movimientoService.getById(999)).rejects.toThrow(NotFoundError);
  });

  it("devuelve el movimiento si existe", async () => {
    const movimientoFalso = { id: 1, tipo: "ENTRADA" } as any;
    vi.mocked(movimientoRepository.findById).mockResolvedValue(movimientoFalso);

    const resultado = await movimientoService.getById(1);
    expect(resultado).toEqual(movimientoFalso);
  });
});

describe("movimientoService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el movimiento no existe", async () => {
    vi.mocked(movimientoRepository.findById).mockResolvedValue(null);

    await expect(
      movimientoService.update(999, { motivo: "test" })
    ).rejects.toThrow(NotFoundError);
  });

  it("actualiza el movimiento si existe", async () => {
    const movimientoExistente = { id: 1, motivo: "viejo" } as any;
    const movimientoActualizado = { id: 1, motivo: "nuevo" } as any;

    vi.mocked(movimientoRepository.findById).mockResolvedValue(movimientoExistente);
    vi.mocked(movimientoRepository.update).mockResolvedValue(movimientoActualizado);

    const resultado = await movimientoService.update(1, { motivo: "nuevo" });

    expect(resultado).toEqual(movimientoActualizado);
    expect(movimientoRepository.update).toHaveBeenCalledWith(1, { motivo: "nuevo" });
  });
});

describe("movimientoService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el movimiento no existe", async () => {
    vi.mocked(movimientoRepository.findById).mockResolvedValue(null);

    await expect(movimientoService.delete(999)).rejects.toThrow(NotFoundError);
  });

  it("elimina el movimiento si existe", async () => {
    const movimientoExistente = { id: 1 } as any;
    vi.mocked(movimientoRepository.findById).mockResolvedValue(movimientoExistente);
    vi.mocked(movimientoRepository.delete).mockResolvedValue(movimientoExistente);

    await movimientoService.delete(1);

    expect(movimientoRepository.delete).toHaveBeenCalledWith(1);
  });
});