import { describe, it, expect, vi, beforeEach } from "vitest";
import { categoriaService } from "./categoria.service";
import { productoService } from "./producto.service";
import { clienteService } from "./cliente.service";
import { movimientoService } from "./movimiento.service";
import { estadisticaService } from "./estadistica.service";
import { categoriaRepository } from "../repositores/categoria.repository";
import { productoRepository } from "../repositores/producto.repository";
import { clienteRepository } from "../repositores/cliente.repository";
import { movimientoRepository } from "../repositores/movimiento.repository";
import { ventaRepository } from "../repositores/venta.repository";
import { NotFoundError } from "../utils/errors";

vi.mock("../repositores/categoria.repository");
vi.mock("../repositores/producto.repository");
vi.mock("../repositores/cliente.repository");
vi.mock("../repositores/movimiento.repository");
vi.mock("../repositores/venta.repository");
vi.mock("../config/prisma", () => ({
  prisma: { $transaction: vi.fn((callback) => callback({})) },
}));

// Estos tests verifican el cableado del aislamiento con repos mockeados:
// cada servicio debe pasar el comercioId del token (nunca del body) y un id
// ajeno debe responder 404 sin confirmar existencia.
describe("aislamiento por comercio (scope en repos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("categoría de otro comercio responde 404", async () => {
    vi.mocked(categoriaRepository.findById).mockResolvedValue(null);

    await expect(categoriaService.getById(1, 2)).rejects.toThrow(NotFoundError);
    expect(categoriaRepository.findById).toHaveBeenCalledWith(1, 2);
  });

  it("producto.getAll solo pide datos del comercio", async () => {
    vi.mocked(productoRepository.findAll).mockResolvedValue([]);
    vi.mocked(productoRepository.count).mockResolvedValue(0);

    await productoService.getAll(2, 1, 10);

    expect(productoRepository.findAll).toHaveBeenCalledWith(2, 0, 10);
    expect(productoRepository.count).toHaveBeenCalledWith(2);
  });

  it("producto no se crea con categoría de otro comercio", async () => {
    vi.mocked(categoriaRepository.findById).mockResolvedValue(null);

    await expect(
      productoService.create(
        { nombre: "P", precioCompra: 10, precioVenta: 20, stock: 1, categoriaId: 9 },
        2
      )
    ).rejects.toThrow(NotFoundError);
    expect(productoRepository.create).not.toHaveBeenCalled();
  });

  it("cliente inactivo o ajeno responde 404", async () => {
    vi.mocked(clienteRepository.findById).mockResolvedValue({ id: 1, activo: false } as any);

    await expect(clienteService.getById(1, 2)).rejects.toThrow(NotFoundError);
    expect(clienteRepository.findById).toHaveBeenCalledWith(1, 2);
  });

  it("movimiento no se crea sobre producto de otro comercio", async () => {
    vi.mocked(productoRepository.findById).mockResolvedValue(null);

    await expect(
      movimientoService.create({ tipo: "SALIDA", cantidad: 1, productoId: 9 }, 2)
    ).rejects.toThrow(NotFoundError);
    expect(movimientoRepository.create).not.toHaveBeenCalled();
  });

  it("estadística solo agrega ventas del comercio", async () => {
    vi.mocked(ventaRepository.sumarRecaudacion).mockResolvedValue({ _sum: { total: 100 } } as any);

    const resultado = await estadisticaService.getRecaudacion(2, { desde: "2026-01-01", hasta: "2026-01-31" });

    expect(ventaRepository.sumarRecaudacion).toHaveBeenCalledWith(
      2,
      expect.any(Date),
      expect.any(Date)
    );
    expect(resultado.totalRecaudado).toBe(100);
  });
});
