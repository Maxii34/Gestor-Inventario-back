import { describe, it, expect } from "vitest";
import {
  LIMITE_POR_DEFECTO,
  LIMITE_MAXIMO,
  PAGINA_MAXIMA,
  leerPaginacion,
} from "./paginacion";

describe("leerPaginacion", () => {
  it("sin parámetros usa los valores por defecto", () => {
    expect(leerPaginacion({})).toEqual({
      page: 1,
      limit: LIMITE_POR_DEFECTO,
    });
  });

  it("acepta valores válidos", () => {
    expect(leerPaginacion({ page: "3", limit: "25" })).toEqual({
      page: 3,
      limit: 25,
    });
  });

  it("acota el limit al máximo", () => {
    expect(leerPaginacion({ limit: "1000000" }).limit).toBe(LIMITE_MAXIMO);
  });

  it("cae en los defaults si los valores no son numéricos", () => {
    expect(leerPaginacion({ page: "abc", limit: "abc" })).toEqual({
      page: 1,
      limit: LIMITE_POR_DEFECTO,
    });
  });

  it("acota los negativos a 1", () => {
    expect(leerPaginacion({ page: "-5", limit: "-5" })).toEqual({
      page: 1,
      limit: 1,
    });
  });

  it("trata el cero como ausente y usa los defaults", () => {
    expect(leerPaginacion({ page: "0", limit: "0" })).toEqual({
      page: 1,
      limit: LIMITE_POR_DEFECTO,
    });
  });

  it("trunca los decimales", () => {
    expect(leerPaginacion({ page: "2.9", limit: "7.8" })).toEqual({
      page: 2,
      limit: 7,
    });
  });

  it("acota la página al máximo", () => {
    expect(leerPaginacion({ page: "99999999999" }).page).toBe(PAGINA_MAXIMA);
  });

  it("descarta los parámetros repetidos (arreglos)", () => {
    expect(
      leerPaginacion({ page: ["3", "4"], limit: ["20", "30"] })
    ).toEqual({
      page: 1,
      limit: LIMITE_POR_DEFECTO,
    });
    expect(leerPaginacion({ page: ["3"], limit: ["20"] })).toEqual({
      page: 1,
      limit: LIMITE_POR_DEFECTO,
    });
  });
});
