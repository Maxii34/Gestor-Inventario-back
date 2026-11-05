import { describe, it, expect, vi, beforeEach } from "vitest";
import { categoriaService } from "./categoria.service";
import { categoriaRepository } from "../repositores/categoria.repository";

vi.mock("../repositores/categoria.repository");

describe("categoriaService.getAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide la página y el total con comercio, búsqueda recortada y meta", async () => {
    const categorias = [{ id: 1, nombre: "Bebidas" }];
    vi.mocked(categoriaRepository.findAll).mockResolvedValue(categorias as any);
    vi.mocked(categoriaRepository.count).mockResolvedValue(7);

    const resultado = await categoriaService.getAll(4, 3, 2, "  Beb  ");

    expect(categoriaRepository.findAll).toHaveBeenCalledWith(4, 4, 2, "Beb");
    expect(categoriaRepository.count).toHaveBeenCalledWith(4, "Beb");
    expect(resultado).toEqual({
      data: categorias,
      meta: { total: 7, page: 3, limit: 2, totalPaginas: 4 },
    });
  });

  it("ignora búsquedas no válidas o mayores a 100 caracteres", async () => {
    vi.mocked(categoriaRepository.findAll).mockResolvedValue([] as any);
    vi.mocked(categoriaRepository.count).mockResolvedValue(0);

    await categoriaService.getAll(4, 1, 100, "x".repeat(101));

    expect(categoriaRepository.findAll).toHaveBeenCalledWith(4, 0, 100, undefined);
    expect(categoriaRepository.count).toHaveBeenCalledWith(4, undefined);
  });
});
