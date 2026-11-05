import { describe, it, expect } from "vitest";
import {
  DIAS_GRACIA,
  calcularNuevoAcceso,
  estadoSuscripcion,
  finDeDiaArgentina,
  sumarMeses,
} from "./suscripcion";

const MS_DIA = 24 * 60 * 60 * 1000;

const fechaArgentina = (fecha: Date): string => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${valor("year")}-${valor("month")}-${valor("day")}`;
};

describe("sumarMeses", () => {
  it("31/01 + 1 mes cae en el 28/02 de un año común", () => {
    const resultado = sumarMeses(new Date("2025-01-31T12:00:00.000Z"), 1);
    expect(fechaArgentina(resultado)).toBe("2025-02-28");
  });

  it("31/01 + 1 mes cae en el 29/02 de un año bisiesto", () => {
    const resultado = sumarMeses(new Date("2024-01-31T12:00:00.000Z"), 1);
    expect(fechaArgentina(resultado)).toBe("2024-02-29");
  });
});

describe("finDeDiaArgentina", () => {
  it("devuelve el último instante del día calendario argentino", () => {
    const resultado = finDeDiaArgentina(new Date("2025-01-10T15:00:00.000Z"));
    expect(resultado.toISOString()).toBe("2025-01-11T02:59:59.999Z");
    expect(fechaArgentina(resultado)).toBe("2025-01-10");
  });

  it("una hora 22:00 de Argentina no cambia de día", () => {
    // 2025-01-10T01:00Z es 2025-01-09 22:00 en Argentina.
    const resultado = finDeDiaArgentina(new Date("2025-01-10T01:00:00.000Z"));
    expect(resultado.toISOString()).toBe("2025-01-10T02:59:59.999Z");
    expect(fechaArgentina(resultado)).toBe("2025-01-09");
  });
});

describe("calcularNuevoAcceso", () => {
  it("pagar antes de vencer acumula sobre el vencimiento actual", () => {
    const accesoHastaActual = finDeDiaArgentina(
      new Date("2025-11-15T15:00:00.000Z")
    );
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    const resultado = calcularNuevoAcceso({
      accesoHastaActual,
      ahora,
      meses: 3,
    });

    expect(fechaArgentina(resultado)).toBe("2026-02-15");
    expect(resultado.toISOString()).toBe(
      finDeDiaArgentina(new Date("2026-02-15T15:00:00.000Z")).toISOString()
    );
  });

  it("pagar vencido arranca desde hoy", () => {
    const accesoHastaActual = finDeDiaArgentina(
      new Date("2025-11-01T15:00:00.000Z")
    );
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    const resultado = calcularNuevoAcceso({
      accesoHastaActual,
      ahora,
      meses: 1,
    });

    expect(fechaArgentina(resultado)).toBe("2025-12-10");
  });

  it("sin acceso previo arranca desde hoy", () => {
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    const resultado = calcularNuevoAcceso({
      accesoHastaActual: null,
      ahora,
      meses: 1,
    });

    expect(fechaArgentina(resultado)).toBe("2025-12-10");
  });

  it("suma días de calendario", () => {
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    const resultado = calcularNuevoAcceso({
      accesoHastaActual: null,
      ahora,
      dias: 5,
    });

    expect(fechaArgentina(resultado)).toBe("2025-11-15");
  });

  it("rechaza meses fuera de 1..24", () => {
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    for (const meses of [0, -1, 25, 1.5]) {
      expect(() =>
        calcularNuevoAcceso({ accesoHastaActual: null, ahora, meses })
      ).toThrow(RangeError);
    }
  });

  it("rechaza días fuera de 1..365", () => {
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    for (const dias of [0, -1, 366, 2.5]) {
      expect(() =>
        calcularNuevoAcceso({ accesoHastaActual: null, ahora, dias })
      ).toThrow(RangeError);
    }
  });

  it("exige meses o días", () => {
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    expect(() =>
      calcularNuevoAcceso({ accesoHastaActual: null, ahora })
    ).toThrow(RangeError);
  });

  it("acepta los límites de meses y días", () => {
    const ahora = new Date("2025-11-10T15:00:00.000Z");

    expect(fechaArgentina(calcularNuevoAcceso({
      accesoHastaActual: null,
      ahora,
      meses: 24,
    }))).toBe("2027-11-10");

    expect(fechaArgentina(calcularNuevoAcceso({
      accesoHastaActual: null,
      ahora,
      dias: 365,
    }))).toBe("2026-11-10");
  });
});

describe("estadoSuscripcion", () => {
  const ahora = new Date("2025-11-10T15:00:00.000Z");

  it("SUSPENDIDO cuando el comercio está inactivo", () => {
    expect(
      estadoSuscripcion(
        { activo: false, accesoHasta: new Date(ahora.getTime() + MS_DIA) },
        ahora
      )
    ).toEqual({ estado: "SUSPENDIDO" });
  });

  it("SIN_VENCIMIENTO cuando accesoHasta es null", () => {
    expect(
      estadoSuscripcion({ activo: true, accesoHasta: null }, ahora)
    ).toEqual({ estado: "SIN_VENCIMIENTO" });
  });

  it("VIGENTE cuando vence en el futuro o justo ahora", () => {
    expect(
      estadoSuscripcion(
        { activo: true, accesoHasta: new Date(ahora.getTime() + 2 * MS_DIA) },
        ahora
      )
    ).toEqual({ estado: "VIGENTE", diasRestantes: 2 });

    expect(
      estadoSuscripcion({ activo: true, accesoHasta: ahora }, ahora)
    ).toEqual({ estado: "VIGENTE", diasRestantes: 0 });
  });

  it("EN_GRACIA dentro de los DIAS_GRACIA posteriores al vencimiento", () => {
    expect(
      estadoSuscripcion(
        { activo: true, accesoHasta: new Date(ahora.getTime() - MS_DIA) },
        ahora
      )
    ).toEqual({ estado: "EN_GRACIA", diasRestantes: 2 });
  });

  it("incluye el último segundo de la gracia", () => {
    const casiFueraDeGracia = new Date(
      ahora.getTime() - (DIAS_GRACIA * MS_DIA - 1000)
    );

    expect(
      estadoSuscripcion({ activo: true, accesoHasta: casiFueraDeGracia }, ahora)
        .estado
    ).toBe("EN_GRACIA");

    expect(
      estadoSuscripcion(
        {
          activo: true,
          accesoHasta: new Date(ahora.getTime() - DIAS_GRACIA * MS_DIA),
        },
        ahora
      ).estado
    ).toBe("EN_GRACIA");
  });

  it("VENCIDA pasada la gracia", () => {
    expect(
      estadoSuscripcion(
        {
          activo: true,
          accesoHasta: new Date(ahora.getTime() - DIAS_GRACIA * MS_DIA - 1),
        },
        ahora
      )
    ).toEqual({ estado: "VENCIDA" });
  });
});
