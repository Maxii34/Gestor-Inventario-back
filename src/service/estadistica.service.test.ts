import { describe, it, expect, vi, beforeEach } from "vitest";
import { estadisticaService } from "./estadistica.service";
import { ventaRepository } from "../repositores/venta.repository";
import { BadRequestError } from "../utils/errors";

vi.mock("../repositores/venta.repository");
vi.mock("../repositores/usuario.repository");
vi.mock("../config/prisma", () => ({
  prisma: { venta: { groupBy: vi.fn() } },
}));

describe("estadisticaService.getRecaudacion - día de Argentina", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calcula los límites con el día calendario argentino y no con el del servidor", async () => {
    vi.mocked(ventaRepository.sumarRecaudacion).mockResolvedValue({
      _sum: { total: 100 },
    } as any);

    await estadisticaService.getRecaudacion(1, {
      desde: "2025-01-10",
      hasta: "2025-01-10",
    });

    expect(ventaRepository.sumarRecaudacion).toHaveBeenCalledWith(
      1,
      new Date("2025-01-10T03:00:00.000Z"),
      new Date("2025-01-11T02:59:59.999Z")
    );
  });

  it("rechaza fechas inexistentes (31/02)", async () => {
    await expect(
      estadisticaService.getRecaudacion(1, {
        desde: "2025-02-31",
        hasta: "2025-03-01",
      })
    ).rejects.toThrow(BadRequestError);

    expect(ventaRepository.sumarRecaudacion).not.toHaveBeenCalled();
  });
});
