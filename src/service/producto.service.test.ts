import { describe, it, expect, vi, beforeEach } from "vitest";
import { productoService } from "./producto.service";
import { productoRepository } from "../repositores/producto.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { BadRequestError, NotFoundError } from "../utils/errors";

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
