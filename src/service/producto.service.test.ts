import { describe, it, expect, vi, beforeEach } from "vitest";
import { productoService } from "./producto.service";
import { productoRepository } from "../repositores/producto.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { productoSchema } from "../validators/producto.validation";
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

  it("sigue rechazando si stock no se env铆a", async () => {
    await expect(productoService.create({ ...productoBase }, 1)).rejects.toThrow(
      BadRequestError
    );
    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza una categor铆a de otro comercio", async () => {
    vi.mocked(categoriaRepository.findById).mockResolvedValue(null);

    await expect(
      productoService.create({ ...productoBase, stock: 0 }, 1)
    ).rejects.toThrow(NotFoundError);
    expect(productoRepository.create).not.toHaveBeenCalled();
  });
});

describe("productoService c贸digo de barras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza crear un producto con un c贸digo ya existente en el comercio", async () => {
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

  it("rechaza actualizar con el c贸digo de otro producto del mismo comercio", async () => {
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

  it("permite actualizar el propio producto con su mismo c贸digo", async () => {
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

  it("permite quitar el c贸digo enviando null sin buscar duplicados", async () => {
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

describe("productoService.create: costo por paquete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoriaRepository.findById).mockResolvedValue({ id: 1 } as any);
    vi.mocked(productoRepository.create).mockResolvedValue({ id: 10 } as any);
  });

  it("calcula 71.4286 para una caja de 70 unidades a 5000", async () => {
    await productoService.create(
      {
        nombre: "Caja",
        precioCompraPaquete: 5000,
        unidadesPorPaquete: 70,
        precioVenta: 100,
        stock: 5,
        categoriaId: 1,
      },
      1
    );

    const data = vi.mocked(productoRepository.create).mock.calls[0][0];
    expect(String(data.precioCompra)).toBe("71.4286");
    expect(data.unidadesPorPaquete).toBe(70);
    expect(String(data.precioCompraPaquete)).toBe("5000");
  });

  it("usa unidadesPorPaquete 1 por defecto", async () => {
    await productoService.create(
      {
        nombre: "Paquete unitario",
        precioCompraPaquete: 5000,
        precioVenta: 6000,
        stock: 1,
        categoriaId: 1,
      },
      1
    );

    const data = vi.mocked(productoRepository.create).mock.calls[0][0];
    expect(String(data.precioCompra)).toBe("5000");
    expect(data.unidadesPorPaquete).toBe(1);
  });

  it("calcula 333.3333 para 3 unidades a 1000 sin perder precisi髇", async () => {
    await productoService.create(
      {
        nombre: "Tres unidades",
        precioCompraPaquete: 1000,
        unidadesPorPaquete: 3,
        precioVenta: 400,
        stock: 1,
        categoriaId: 1,
      },
      1
    );

    const data = vi.mocked(productoRepository.create).mock.calls[0][0];
    expect(String(data.precioCompra)).toBe("333.3333");
  });

  it("rechaza enviar el costo por unidad y el del paquete a la vez", async () => {
    await expect(
      productoService.create(
        {
          nombre: "Ambos",
          precioCompra: 10,
          precioCompraPaquete: 1000,
          unidadesPorPaquete: 10,
          precioVenta: 20,
          stock: 1,
          categoriaId: 1,
        },
        1
      )
    ).rejects.toThrow(BadRequestError);

    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza no enviar ning鷑 costo", async () => {
    await expect(
      productoService.create(
        {
          nombre: "Sin costo",
          precioVenta: 20,
          stock: 1,
          categoriaId: 1,
        },
        1
      )
    ).rejects.toThrow(BadRequestError);

    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("valida el margen contra el costo unitario calculado", async () => {
    await expect(
      productoService.create(
        {
          nombre: "Margen insuficiente",
          precioCompraPaquete: 5000,
          unidadesPorPaquete: 70,
          precioVenta: 71.4285,
          stock: 1,
          categoriaId: 1,
        },
        1
      )
    ).rejects.toThrow(BadRequestError);

    expect(productoRepository.create).not.toHaveBeenCalled();
  });
});

describe("productoService.update: costo por paquete", () => {
  const existente = {
    id: 10,
    precioCompra: 71.4286,
    precioCompraPaquete: 5000,
    unidadesPorPaquete: 70,
    precioVenta: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(productoRepository.findById).mockResolvedValue(existente as any);
    vi.mocked(productoRepository.update).mockResolvedValue({ id: 10 } as any);
  });

  it("recalcula al actualizar el precio del paquete", async () => {
    await productoService.update(10, 1, { precioCompraPaquete: 7000 });

    const data = vi.mocked(productoRepository.update).mock.calls[0][2];
    expect(String(data.precioCompra)).toBe("100");
    expect(String(data.precioCompraPaquete)).toBe("7000");
    expect(data.unidadesPorPaquete).toBe(70);
  });

  it("recalcula al actualizar solo las unidades", async () => {
    await productoService.update(10, 1, { unidadesPorPaquete: 50 });

    const data = vi.mocked(productoRepository.update).mock.calls[0][2];
    expect(String(data.precioCompra)).toBe("100");
    expect(data.unidadesPorPaquete).toBe(50);
    expect(data).not.toHaveProperty("precioCompraPaquete");
  });

  it("editar el precio de compra directo limpia el precio del paquete", async () => {
    await productoService.update(10, 1, { precioCompra: 60 });

    const data = vi.mocked(productoRepository.update).mock.calls[0][2];
    expect(String(data.precioCompra)).toBe("60");
    expect(data.precioCompraPaquete).toBeNull();
    expect(data.unidadesPorPaquete).toBe(70);
  });

  it("rechaza enviar ambos costos al actualizar", async () => {
    await expect(
      productoService.update(10, 1, {
        precioCompra: 60,
        precioCompraPaquete: 7000,
      })
    ).rejects.toThrow(BadRequestError);

    expect(productoRepository.update).not.toHaveBeenCalled();
  });

  it("valida el margen con el costo recalculado antes de guardar", async () => {
    await expect(
      productoService.update(10, 1, { precioCompraPaquete: 8000 })
    ).rejects.toThrow(BadRequestError);

    expect(productoRepository.update).not.toHaveBeenCalled();
  });
});

describe("productoSchema: unidades por paquete", () => {
  const base = {
    nombre: "Producto",
    precioCompra: 10,
    precioVenta: 20,
    stock: 1,
    categoriaId: 1,
  };

  it.each([0, 100001, 2.5])("rechaza unidades %s", (unidadesPorPaquete) => {
    const resultado = productoSchema.safeParse({ ...base, unidadesPorPaquete });
    expect(resultado.success).toBe(false);
  });
});
