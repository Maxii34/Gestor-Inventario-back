// Zona horaria del negocio: Argentina (UTC-3, sin horario de verano).
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const MS_DIA = 24 * 60 * 60 * 1000;

const aHoraArgentina = (fecha: Date) =>
  new Date(fecha.getTime() + OFFSET_ARGENTINA_MS);

const desdeHoraArgentina = (fecha: Date) =>
  new Date(fecha.getTime() - OFFSET_ARGENTINA_MS);

const esFechaISO = (fecha: string) => /^\d{4}-\d{2}-\d{2}$/.test(fecha);

// Devuelve el día calendario argentino de un instante. Si recibe "AAAA-MM-DD"
// se interpreta como ese día argentino literal, sin corrimientos de zona.
const partesArgentinas = (fecha: Date | string) => {
  if (typeof fecha === "string" && esFechaISO(fecha)) {
    const [anio, mes, dia] = fecha.split("-").map(Number);
    return { anio, mes: mes - 1, dia };
  }

  const instante = typeof fecha === "string" ? new Date(fecha) : fecha;
  const horaArgentina = aHoraArgentina(instante);

  return {
    anio: horaArgentina.getUTCFullYear(),
    mes: horaArgentina.getUTCMonth(),
    dia: horaArgentina.getUTCDate(),
  };
};

// 00:00:00.000 del día argentino, expresado como instante UTC.
export function inicioDeDiaArgentina(fecha: Date | string): Date {
  const { anio, mes, dia } = partesArgentinas(fecha);
  return desdeHoraArgentina(new Date(Date.UTC(anio, mes, dia, 0, 0, 0, 0)));
}

// 23:59:59.999 del día argentino, expresado como instante UTC.
export function finDeDiaArgentina(fecha: Date | string): Date {
  const { anio, mes, dia } = partesArgentinas(fecha);
  return desdeHoraArgentina(new Date(Date.UTC(anio, mes, dia, 23, 59, 59, 999)));
}

// Valida "AAAA-MM-DD" y que la fecha exista de verdad (rechaza 31/02, 30/02, etc.).
export function esFechaISOValida(fecha: string): boolean {
  if (!esFechaISO(fecha)) {
    return false;
  }

  const [anio, mes, dia] = fecha.split("-").map(Number);
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia
  );
}

// Día calendario argentino actual, como "AAAA-MM-DD".
export function hoyArgentina(ahora: Date = new Date()): string {
  const horaArgentina = aHoraArgentina(ahora);
  const anio = horaArgentina.getUTCFullYear();
  const mes = String(horaArgentina.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(horaArgentina.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

// Primer día del mes calendario argentino actual, como "AAAA-MM-DD".
export function primerDiaDelMesArgentina(ahora: Date = new Date()): string {
  return `${hoyArgentina(ahora).slice(0, 7)}-01`;
}

// Cantidad de días de calendario entre dos fechas "AAAA-MM-DD".
export function diferenciaEnDias(desde: string, hasta: string): number {
  const [anioDesde, mesDesde, diaDesde] = desde.split("-").map(Number);
  const [anioHasta, mesHasta, diaHasta] = hasta.split("-").map(Number);

  return Math.round(
    (Date.UTC(anioHasta, mesHasta - 1, diaHasta) -
      Date.UTC(anioDesde, mesDesde - 1, diaDesde)) /
      MS_DIA
  );
}
