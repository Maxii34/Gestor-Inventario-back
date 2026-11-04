import { describe, it, expect, vi, beforeEach } from "vitest";
import { productoService } from "./producto.service";
import { productoRepository } from "../repositores/producto.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

vi.mock("../repositores/producto.repository");
vi.mock("../repositores/categoria.repository");

const productoBase = {
  nombre: "Producto",
  precioCompra: 10,
  precioVenta: 20,
  categoriaId: 1,
};

describe("productoService.create: stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite crear un producto con stock 0", async () => {
    vi.mocked(categoriaRepository.findById).mockResolvedValue({ id: 1 } as any);
    vi.mocked(productoRepository.create).mockResolvedValue({ id: 10, stock: 0 } as any);

    await productoService.create({ ...productoBase, stock: 0 }, 1);

    expect(productoRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 0, comercio: { connect: { id: 1 } } })
    );
  });

  it("sigue rechazando si stock no se envía", async () => {
    await expect(productoService.create({ ...productoBase }, 1)).rejects.toThrow(
      BadRequestError
    );
    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza una categoría de otro comercio", async () => {
    vi.mocked(categoriaRepository.findById).mockResolvedValue(null);

    await expect(
      productoService.create({ ...productoBase, stock: 0 }, 1)
    ).rejects.toThrow(NotFoundError);
    expect(productoRepository.create).not.toHaveBeenCalled();
  });
});

describe("productoService código de barras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza crear un producto con un código ya existente en el comercio", async () => {
    vi.mocked(categoriaRepository.findById).mockResolvedValue({ id: 1 } as any);
    vi.mocked(productoRepository.findByCodigoBarras).mockResolvedValue({
      id: 99,
    } as any);

    await expect(
      productoService.create(
        { ...productoBase, stock: 0, codigoBarras: "ABC123" },
        1
      )
    ).rejects.toThrow(ConflictError);

    expect(productoRepository.findByCodigoBarras).toHaveBeenCalledWith(
      1,
      "ABC123"
    );
    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza actualizar con el código de otro producto del mismo comercio", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue({
      id: 10,
      precioCompra: 10,
      precioVenta: 20,
    } as any);
    vi.mocked(productoRepository.findByCodigoBarras).mockResolvedValue({
      id: 11,
    } as any);

    await expect(
      productoService.update(10, 1, { codigoBarras: "ABC123" })
    ).rejects.toThrow(ConflictError);
    expect(productoRepository.update).not.toHaveBeenCalled();
  });

  it("permite actualizar el propio producto con su mismo código", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue({
      id: 10,
      precioCompra: 10,
      precioVenta: 20,
    } as any);
    vi.mocked(productoRepository.findByCodigoBarras).mockResolvedValue({
      id: 10,
    } as any);
    vi.mocked(productoRepository.update).mockResolvedValue({ id: 10 } as any);

    await productoService.update(10, 1, { codigoBarras: "ABC123" });

    expect(productoRepository.update).toHaveBeenCalledWith(
      10,
      1,
      expect.objectContaining({ codigoBarras: "ABC123" })
    );
  });

  it("permite quitar el código enviando null sin buscar duplicados", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue({
      id: 10,
      precioCompra: 10,
      precioVenta: 20,
    } as any);
    vi.mocked(productoRepository.update).mockResolvedValue({ id: 10 } as any);

    await productoService.update(10, 1, { codigoBarras: null });

    expect(productoRepository.findByCodigoBarras).not.toHaveBeenCalled();
    expect(productoRepository.update).toHaveBeenCalledWith(
      10,
      1,
      expect.objectContaining({ codigoBarras: null })
    );
  });
});
