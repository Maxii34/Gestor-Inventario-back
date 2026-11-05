import { comercioRepository } from "../repositores/comercio.repository";
import { NotFoundError } from "../utils/errors";
import { DIAS_GRACIA, estadoSuscripcion } from "../utils/suscripcion";

export const suscripcionService = {
  obtenerEstado: async (comercioId: number) => {
    const comercio = await comercioRepository.findById(comercioId);
    if (!comercio) {
      throw new NotFoundError("Comercio no encontrado");
    }

    const { estado, diasRestantes } = estadoSuscripcion(
      { activo: comercio.activo, accesoHasta: comercio.accesoHasta },
      new Date()
    );

    return {
      plan: comercio.plan,
      estado,
      accesoHasta: comercio.accesoHasta,
      diasRestantes: diasRestantes ?? null,
      enGracia: estado === "EN_GRACIA",
      soloLectura: estado === "VENCIDA",
      diasGracia: DIAS_GRACIA,
    };
  },
};
