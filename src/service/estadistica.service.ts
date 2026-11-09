import { prisma } from "../config/prisma";
import { ventaRepository } from "../repositores/venta.repository";
import { usuarioRepository } from "../repositores/usuario.repository";
import { BadRequestError } from "../utils/errors";
import {
  finDeDiaArgentina,
  hoyArgentina,
  inicioDeDiaArgentina,
  primerDiaDelMesArgentina,
} from "../utils/fechas";
import { EstadoVenta, RolUsuario } from "../generated/prisma/client";

export interface RecaudacionQuery {
  desde: string;
  hasta: string;
}

export interface RangoFechasQuery {
  desde?: string;
  hasta?: string;
}

interface VendedorResumen {
  id: number;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
}

interface AcumuladoVendedor {
  vendedor: VendedorResumen | null;
  cantidadVentas: number;
  totalVendido: number;
  anuladas: { cantidad: number; total: number };
  ultimaVenta: Date | null;
}

const redondear2 = (valor: number) =>
  Math.round((valor + Number.EPSILON) * 100) / 100;

const filaVacia = (vendedor: VendedorResumen | null): AcumuladoVendedor => ({
  vendedor,
  cantidadVentas: 0,
  totalVendido: 0,
  anuladas: { cantidad: 0, total: 0 },
  ultimaVenta: null,
});

export const estadisticaService = {
  getRecaudacion: async (comercioId: number, { desde, hasta }: RecaudacionQuery) => {
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

    const resultado = await ventaRepository.sumarRecaudacion(comercioId, fechaDesde, fechaHasta);

    return {
      desde,
      hasta,
      totalRecaudado: Number(resultado._sum.total ?? 0),
    };
  },

  getVendedores: async (
    comercioId: number,
    { desde, hasta }: RangoFechasQuery = {}
  ) => {
    const desdeFinal = desde ?? primerDiaDelMesArgentina();
    const hastaFinal = hasta ?? hoyArgentina();

    const [grupos, usuarios] = await Promise.all([
      prisma.venta.groupBy({
        by: ["vendedorId", "estado"],
        where: {
          comercioId,
          estado: { in: [EstadoVenta.COMPLETADA, EstadoVenta.ANULADA] },
          fecha: {
            gte: inicioDeDiaArgentina(desdeFinal),
            lte: finDeDiaArgentina(hastaFinal),
          },
        },
        _count: { _all: true },
        _sum: { total: true },
        _max: { fecha: true },
      }),
      usuarioRepository.findResumenPorComercio(comercioId),
    ]);

    const acumulados = new Map<number | null, AcumuladoVendedor>();
    for (const usuario of usuarios) {
      acumulados.set(usuario.id, filaVacia(usuario));
    }

    for (const grupo of grupos) {
      let fila = acumulados.get(grupo.vendedorId);
      if (!fila) {
        // Solo las ventas sin vendedor generan una fila propia con vendedor null.
        if (grupo.vendedorId !== null) {
          continue;
        }
        fila = filaVacia(null);
        acumulados.set(null, fila);
      }

      const cantidad = grupo._count._all;
      const total = Number(grupo._sum.total ?? 0);

      if (grupo.estado === EstadoVenta.COMPLETADA) {
        fila.cantidadVentas += cantidad;
        fila.totalVendido += total;
      } else {
        fila.anuladas.cantidad += cantidad;
        fila.anuladas.total += total;
      }

      const fecha = grupo._max.fecha;
      if (fecha && (!fila.ultimaVenta || fecha > fila.ultimaVenta)) {
        fila.ultimaVenta = fecha;
      }
    }

    const filas = Array.from(acumulados.values())
      .map((fila) => ({
        vendedor: fila.vendedor,
        cantidadVentas: fila.cantidadVentas,
        totalVendido: redondear2(fila.totalVendido),
        ticketPromedio:
          fila.cantidadVentas > 0
            ? redondear2(fila.totalVendido / fila.cantidadVentas)
            : 0,
        anuladas: {
          cantidad: fila.anuladas.cantidad,
          total: redondear2(fila.anuladas.total),
        },
        ultimaVenta: fila.ultimaVenta ? fila.ultimaVenta.toISOString() : null,
      }))
      .sort((a, b) => b.totalVendido - a.totalVendido);

    const suma = filas.reduce(
      (acumulado, fila) => ({
        cantidadVentas: acumulado.cantidadVentas + fila.cantidadVentas,
        totalVendido: acumulado.totalVendido + fila.totalVendido,
        anuladas: {
          cantidad: acumulado.anuladas.cantidad + fila.anuladas.cantidad,
          total: acumulado.anuladas.total + fila.anuladas.total,
        },
      }),
      { cantidadVentas: 0, totalVendido: 0, anuladas: { cantidad: 0, total: 0 } }
    );

    return {
      desde: desdeFinal,
      hasta: hastaFinal,
      filas,
      totales: {
        cantidadVentas: suma.cantidadVentas,
        totalVendido: redondear2(suma.totalVendido),
        ticketPromedio:
          suma.cantidadVentas > 0
            ? redondear2(suma.totalVendido / suma.cantidadVentas)
            : 0,
        anuladas: {
          cantidad: suma.anuladas.cantidad,
          total: redondear2(suma.anuladas.total),
        },
      },
    };
  },
};
