import { ventaRepository } from "../repositores/venta.repository";
import { BadRequestError } from "../utils/errors";

export interface RecaudacionQuery {
  desde: string;
  hasta: string;
}

export const estadisticaService = {
  getRecaudacion: async ({ desde, hasta }: RecaudacionQuery) => {
    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);

    if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
      throw new BadRequestError("Las fechas 'desde' y 'hasta' deben ser válidas (formato AAAA-MM-DD)");
    }

    // Incluir todo el día "hasta" (sin esto, las 00:00 del día final excluiría
    // las ventas hechas durante ese mismo día)
    fechaHasta.setHours(23, 59, 59, 999);

    if (fechaDesde > fechaHasta) {
      throw new BadRequestError("La fecha 'desde' no puede ser posterior a 'hasta'");
    }

    const resultado = await ventaRepository.sumarRecaudacion(fechaDesde, fechaHasta);

    return {
      desde,
      hasta,
      totalRecaudado: Number(resultado._sum.total ?? 0),
    };
  },
};