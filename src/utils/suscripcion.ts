export const DIAS_PRUEBA = 14;
export const DIAS_GRACIA = 3;

const MS_DIA = 24 * 60 * 60 * 1000;
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;

export type EstadoSuscripcion =
  | "SUSPENDIDO"
  | "SIN_VENCIMIENTO"
  | "VIGENTE"
  | "EN_GRACIA"
  | "VENCIDA";

export interface EstadoSuscripcionResultado {
  estado: EstadoSuscripcion;
  diasRestantes?: number;
}

export interface CalcularNuevoAccesoParams {
  accesoHastaActual: Date | null;
  ahora: Date;
  meses?: number;
  dias?: number;
}

const aHoraArgentina = (fecha: Date) =>
  new Date(fecha.getTime() + OFFSET_ARGENTINA_MS);

const desdeHoraArgentina = (fecha: Date) =>
  new Date(fecha.getTime() - OFFSET_ARGENTINA_MS);

export function sumarMeses(fecha: Date, meses: number): Date {
  if (!Number.isInteger(meses)) {
    throw new RangeError("La cantidad de meses debe ser un entero");
  }

  const horaArgentina = aHoraArgentina(fecha);
  const anio = horaArgentina.getUTCFullYear();
  const mes = horaArgentina.getUTCMonth();
  const dia = horaArgentina.getUTCDate();

  const destino = new Date(
    Date.UTC(
      anio,
      mes + meses,
      1,
      horaArgentina.getUTCHours(),
      horaArgentina.getUTCMinutes(),
      horaArgentina.getUTCSeconds(),
      horaArgentina.getUTCMilliseconds()
    )
  );

  const ultimoDiaDelMes = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)
  ).getUTCDate();

  destino.setUTCDate(Math.min(dia, ultimoDiaDelMes));
  return desdeHoraArgentina(destino);
}

function sumarDias(fecha: Date, dias: number): Date {
  const horaArgentina = aHoraArgentina(fecha);
  horaArgentina.setUTCDate(horaArgentina.getUTCDate() + dias);
  return desdeHoraArgentina(horaArgentina);
}

export function finDeDiaArgentina(fecha: Date): Date {
  const horaArgentina = aHoraArgentina(fecha);
  const finDelDia = new Date(
    Date.UTC(
      horaArgentina.getUTCFullYear(),
      horaArgentina.getUTCMonth(),
      horaArgentina.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
  return desdeHoraArgentina(finDelDia);
}

export function calcularNuevoAcceso({
  accesoHastaActual,
  ahora,
  meses,
  dias,
}: CalcularNuevoAccesoParams): Date {
  const tieneMeses = meses !== undefined;
  const tieneDias = dias !== undefined;

  if (!tieneMeses && !tieneDias) {
    throw new RangeError("Debés indicar meses o días");
  }

  if (tieneMeses && (!Number.isInteger(meses) || meses < 1 || meses > 24)) {
    throw new RangeError("La cantidad de meses debe estar entre 1 y 24");
  }

  if (tieneDias && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
    throw new RangeError("La cantidad de días debe estar entre 1 y 365");
  }

  const base =
    accesoHastaActual && accesoHastaActual.getTime() > ahora.getTime()
      ? accesoHastaActual
      : ahora;

  let resultado = base;
  if (tieneMeses) {
    resultado = sumarMeses(resultado, meses as number);
  }
  if (tieneDias) {
    resultado = sumarDias(resultado, dias as number);
  }

  return finDeDiaArgentina(resultado);
}

export function estadoSuscripcion(
  comercio: { activo: boolean; accesoHasta: Date | null },
  ahora: Date
): EstadoSuscripcionResultado {
  if (!comercio.activo) {
    return { estado: "SUSPENDIDO" };
  }

  if (!comercio.accesoHasta) {
    return { estado: "SIN_VENCIMIENTO" };
  }

  const diferencia = comercio.accesoHasta.getTime() - ahora.getTime();

  if (diferencia >= 0) {
    return {
      estado: "VIGENTE",
      diasRestantes: Math.ceil(diferencia / MS_DIA),
    };
  }

  const vencidoHace = -diferencia;
  if (vencidoHace <= DIAS_GRACIA * MS_DIA) {
    return {
      estado: "EN_GRACIA",
      diasRestantes: Math.ceil(
        (DIAS_GRACIA * MS_DIA - vencidoHace) / MS_DIA
      ),
    };
  }

  return { estado: "VENCIDA" };
}
