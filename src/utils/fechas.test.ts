import { describe, it, expect } from "vitest";
import {
  diferenciaEnDias,
  esFechaISOValida,
  finDeDiaArgentina,
  hoyArgentina,
  inicioDeDiaArgentina,
  primerDiaDelMesArgentina,
} from "./fechas";

describe("inicioDeDiaArgentina", () => {
  it("devuelve las 00:00 argentinas como instante UTC", () => {
    expect(inicioDeDiaArgentina("2025-01-10").toISOString()).toBe(
      "2025-01-10T03:00:00.000Z"
    );
  });

  it("una venta de 23:30 ART (02:30 UTC del día siguiente) queda en su día argentino", () => {
    const instante = new Date("2025-01-11T02:30:00.000Z");

    expect(inicioDeDiaArgentina(instante).toISOString()).toBe(
      "2025-01-10T03:00:00.000Z"
    );
  });
});

describe("finDeDiaArgentina", () => {
  it("devuelve el último instante del día argentino como instante UTC", () => {
    expect(finDeDiaArgentina("2025-01-10").toISOString()).toBe(
      "2025-01-11T02:59:59.999Z"
    );
  });

  it("una venta de 23:30 ART (02:30 UTC del día siguiente) queda en su día argentino", () => {
    const instante = new Date("2025-01-11T02:30:00.000Z");

    expect(finDeDiaArgentina(instante).toISOString()).toBe(
      "2025-01-11T02:59:59.999Z"
    );
  });
});

describe("hoyArgentina / primerDiaDelMesArgentina", () => {
  it("usa el día calendario argentino, no el UTC", () => {
    const instante = new Date("2025-01-11T02:30:00.000Z");

    expect(hoyArgentina(instante)).toBe("2025-01-10");
    expect(primerDiaDelMesArgentina(instante)).toBe("2025-01-01");
  });
});

describe("esFechaISOValida", () => {
  it("acepta fechas reales", () => {
    expect(esFechaISOValida("2024-02-29")).toBe(true);
    expect(esFechaISOValida("2025-01-01")).toBe(true);
  });

  it("rechaza fechas inexistentes y formatos incorrectos", () => {
    expect(esFechaISOValida("2025-02-29")).toBe(false);
    expect(esFechaISOValida("2025-02-31")).toBe(false);
    expect(esFechaISOValida("2025-13-01")).toBe(false);
    expect(esFechaISOValida("2025-1-1")).toBe(false);
    expect(esFechaISOValida("no-es-fecha")).toBe(false);
  });
});

describe("diferenciaEnDias", () => {
  it("cuenta días de calendario", () => {
    expect(diferenciaEnDias("2025-01-01", "2025-01-01")).toBe(0);
    expect(diferenciaEnDias("2025-01-01", "2025-01-31")).toBe(30);
    expect(diferenciaEnDias("2024-01-01", "2025-01-01")).toBe(366);
  });
});
