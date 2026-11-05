export const LIMITE_POR_DEFECTO = 10;
export const LIMITE_MAXIMO = 100;
export const PAGINA_MAXIMA = 100_000;

const acotar = (valor: number, minimo: number, maximo: number) =>
  Math.min(Math.max(valor, minimo), maximo);

// Lee page/limit de la query string acotando ambos a rangos seguros.
// Un parámetro repetido llega como arreglo: se descarta y cae en el default.
export const leerPaginacion = (
  query: { page?: unknown; limit?: unknown },
  opciones: { limitePorDefecto?: number } = {}
) => {
  const pageCrudo = Array.isArray(query.page) ? NaN : Number(query.page);
  const limitCrudo = Array.isArray(query.limit) ? NaN : Number(query.limit);
  const limitePorDefecto =
    opciones.limitePorDefecto ?? LIMITE_POR_DEFECTO;

  const page = acotar(Math.floor(pageCrudo) || 1, 1, PAGINA_MAXIMA);
  const limit = acotar(
    Math.floor(limitCrudo) || limitePorDefecto,
    1,
    LIMITE_MAXIMO
  );

  return { page, limit };
};
