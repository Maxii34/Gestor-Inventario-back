import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

// Integración HTTP de la vigencia contra PostgreSQL real. Igual que
// aislamiento.integration.test.ts: solo corre con una base EXCLUSIVA y
// desechable (npm run test:integration). Las variables se fijan ANTES del
// import dinámico de la app porque algunos módulos las leen al cargar.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

const JWT_SECRET_TEST = "test-secret-vigencia-negocio";
const PLATAFORMA_JWT_SECRET_TEST = "test-secret-vigencia-plataforma";
const MS_DIA = 24 * 60 * 60 * 1000;

vi.mock("morgan", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Metodo = "get" | "post" | "put" | "delete";
type Prisma = typeof import("./config/prisma.js")["prisma"];

interface ComercioFixture {
  id: number;
  slug: string;
  email: string;
  password: string;
  token: string;
  refreshToken: string;
}

describe.skipIf(!ES_BASE_EXCLUSIVA)("integración HTTP: vigencia y suspensión", () => {
  let app: import("express").Express;
  let prisma: Prisma;

  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const comercios: number[] = [];
  const superadmins: number[] = [];

  let platformToken = "";

  let vigente!: ComercioFixture;
  let sinVencimiento!: ComercioFixture;
  let enGracia!: ComercioFixture;
  let vencida!: ComercioFixture;
  let vencidaCategoriaId = 0;
  let suspendido!: ComercioFixture;
  let reac!: ComercioFixture;
  let isoA!: ComercioFixture;
  let isoB!: ComercioFixture;
  let cache!: ComercioFixture;

  const llamar = (
    metodo: Metodo,
    ruta: string,
    token?: string,
    body?: object
  ) => {
    let req = request(app)[metodo](ruta);
    if (token) req = req.set("Authorization", `Bearer ${token}`);
    return body !== undefined ? req.send(body) : req;
  };

  const plataforma = (metodo: Metodo, ruta: string, body?: object) =>
    llamar(metodo, `/plataforma${ruta}`, platformToken, body);

  const registrar = async (tag: string): Promise<ComercioFixture> => {
    const slug = `vig-${tag}-${sufijo}`;
    const email = `admin-${tag}-${sufijo}@test.com`;
    const password = "123456";

    // Se crea desde plataforma para no consumir el limitador de registros
    // públicos, que permite 5 altas por hora y acá se necesitan varias.
    const reg = await plataforma("post", "/comercios", {
      nombre: `Vigencia ${tag} ${sufijo}`,
      slug,
      adminNombre: `Admin ${tag}`,
      adminEmail: email,
      adminPassword: password,
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);

    const id = reg.body.data.comercio.id as number;
    comercios.push(id);

    const login = await request(app)
      .post("/usuarios/login")
      .send({ slug, email, password });
    expect(login.status, JSON.stringify(login.body)).toBe(200);

    return {
      id,
      slug,
      email,
      password,
      token: login.body.data.accessToken as string,
      refreshToken: login.body.data.refreshToken as string,
    };
  };

  const loginComercio = (comercio: ComercioFixture, password = comercio.password) =>
    request(app).post("/usuarios/login").send({
      slug: comercio.slug,
      email: comercio.email,
      password,
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.JWT_SECRET = JWT_SECRET_TEST;
    process.env.PLATAFORMA_JWT_SECRET = PLATAFORMA_JWT_SECRET_TEST;
    process.env.VIGENCIA_CACHE_SEGUNDOS = "0";

    app = (await import("./app.js")).default as unknown as import("express").Express;
    prisma = (await import("./config/prisma.js")).prisma;
    await prisma.$queryRaw`SELECT 1`;

    const hash = await bcrypt.hash("superadmin123", 10);
    const superadmin = await prisma.superadmin.create({
      data: {
        nombre: "Superadmin vigencia",
        email: `super-vig-${sufijo}@test.com`,
        password: hash,
      },
    });
    superadmins.push(superadmin.id);

    const loginPlataforma = await request(app).post("/plataforma/login").send({
      email: superadmin.email,
      password: "superadmin123",
    });
    expect(loginPlataforma.status, JSON.stringify(loginPlataforma.body)).toBe(200);
    platformToken = loginPlataforma.body.data.accessToken as string;

    vigente = await registrar("vigente");

    sinVencimiento = await registrar("sin-vencimiento");
    await prisma.comercio.update({
      where: { id: sinVencimiento.id },
      data: { accesoHasta: null },
    });

    enGracia = await registrar("gracia");
    await prisma.comercio.update({
      where: { id: enGracia.id },
      data: { accesoHasta: new Date(Date.now() - 1 * MS_DIA) },
    });

    vencida = await registrar("vencida");
    const categoriaVencida = await llamar("post", "/categorias", vencida.token, {
      nombre: `Cat vencida ${sufijo}`,
    });
    expect(
      categoriaVencida.status,
      JSON.stringify(categoriaVencida.body)
    ).toBe(201);
    vencidaCategoriaId = categoriaVencida.body.data.id as number;
    await prisma.comercio.update({
      where: { id: vencida.id },
      data: { accesoHasta: new Date(Date.now() - 10 * MS_DIA) },
    });

    suspendido = await registrar("suspendido");
    await prisma.comercio.update({
      where: { id: suspendido.id },
      data: { activo: false },
    });

    reac = await registrar("reac");
    isoA = await registrar("iso-a");
    isoB = await registrar("iso-b");
    cache = await registrar("cache");
  }, 30000);

  afterAll(async () => {
    const porComercio = { comercioId: { in: comercios } };

    await prisma.detalleVenta.deleteMany({ where: porComercio });
    await prisma.venta.deleteMany({ where: porComercio });
    await prisma.movimientoStock.deleteMany({ where: porComercio });
    await prisma.producto.deleteMany({ where: porComercio });
    await prisma.categoria.deleteMany({ where: porComercio });
    await prisma.cliente.deleteMany({ where: porComercio });
    await prisma.proveedor.deleteMany({ where: porComercio });
    await prisma.refreshToken.deleteMany({
      where: { usuario: porComercio },
    });
    await prisma.usuario.deleteMany({ where: porComercio });
    await prisma.pago.deleteMany({ where: porComercio });
    await prisma.auditoriaPlataforma.deleteMany({
      where: {
        OR: [
          { comercioId: { in: comercios } },
          { superadminId: { in: superadmins } },
        ],
      },
    });
    await prisma.comercio.deleteMany({ where: { id: { in: comercios } } });
    await prisma.superadmin.deleteMany({ where: { id: { in: superadmins } } });
    await prisma.$disconnect();
  }, 30000);

  // ------------------------------------------------------------------ a
  describe("a) VIGENTE y SIN_VENCIMIENTO", () => {
    it("pueden leer y escribir", async () => {
      const casos: [string, ComercioFixture][] = [
        ["vigente", vigente],
        ["sin-vencimiento", sinVencimiento],
      ];

      for (const [nombre, comercio] of casos) {
        const get = await llamar("get", "/categorias", comercio.token);
        expect(get.status, `${nombre} GET`).toBe(200);

        const post = await llamar("post", "/categorias", comercio.token, {
          nombre: `Cat ${nombre} ${sufijo}`,
        });
        expect(post.status, `${nombre} POST: ${JSON.stringify(post.body)}`).toBe(201);
      }
    });
  });

  // ------------------------------------------------------------------ b
  describe("b) EN_GRACIA", () => {
    it("permite escribir dentro de los días de gracia", async () => {
      const get = await llamar("get", "/categorias", enGracia.token);
      expect(get.status).toBe(200);

      const post = await llamar("post", "/categorias", enGracia.token, {
        nombre: `Cat gracia ${sufijo}`,
      });
      expect(post.status, JSON.stringify(post.body)).toBe(201);
    });
  });

  // ------------------------------------------------------------------ c
  describe("c) VENCIDA", () => {
    it("permite leer pero bloquea POST, PUT y DELETE de negocio", async () => {
      const get = await llamar("get", "/categorias", vencida.token);
      expect(get.status).toBe(200);

      const escrituras: [Metodo, string, object?][] = [
        ["post", "/categorias", { nombre: `Cat vencida nueva ${sufijo}` }],
        [
          "put",
          `/categorias/${vencidaCategoriaId}`,
          { nombre: `Cat vencida editada ${sufijo}` },
        ],
        ["delete", `/categorias/${vencidaCategoriaId}`],
      ];

      for (const [metodo, ruta, body] of escrituras) {
        const res = await llamar(metodo, ruta, vencida.token, body);
        expect(
          res.status,
          `${metodo} ${ruta}: ${JSON.stringify(res.body)}`
        ).toBe(403);
        expect(res.body.mensaje).toBe(
          "Tu suscripción venció: el sistema está en modo solo lectura. Contactá a soporte para renovarla."
        );
      }
    });

    it("login, refresh y logout siguen funcionando", async () => {
      const refresh = await request(app)
        .post("/usuarios/refresh")
        .send({ refreshToken: vencida.refreshToken });
      expect(refresh.status, JSON.stringify(refresh.body)).toBe(200);
      const refreshTokenNuevo = refresh.body.data.refreshToken as string;

      const logout = await request(app)
        .post("/usuarios/logout")
        .send({ refreshToken: refreshTokenNuevo });
      expect(logout.status, JSON.stringify(logout.body)).toBe(200);

      const login = await loginComercio(vencida);
      expect(login.status, JSON.stringify(login.body)).toBe(200);
    });

    it("GET /suscripcion devuelve soloLectura true", async () => {
      const res = await llamar("get", "/suscripcion", vencida.token);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({
        plan: "PRUEBA",
        estado: "VENCIDA",
        enGracia: false,
        soloLectura: true,
        diasGracia: 3,
      });
      expect(res.body.data.diasRestantes).toBeNull();
    });
  });

  // ------------------------------------------------------------------ d
  describe("d) SUSPENDIDO", () => {
    it("un token ya emitido deja de servir al instante", async () => {
      const res = await llamar("get", "/categorias", suspendido.token);
      expect(res.status).toBe(401);
      expect(res.body.mensaje).toBe(
        "La cuenta está suspendida. Contactá a soporte."
      );
    });

    it("el login con contraseña correcta da 403 con mensaje claro", async () => {
      const res = await loginComercio(suspendido);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.mensaje).toBe(
        "La cuenta está suspendida. Contactá a soporte."
      );
    });

    it("el login con contraseña incorrecta mantiene el 401 genérico", async () => {
      const res = await loginComercio(suspendido, "incorrecta");
      expect(res.status).toBe(401);
      expect(res.body.mensaje).toBe("Credenciales inválidas");
    });

    it("el refresh da 401", async () => {
      const res = await request(app)
        .post("/usuarios/refresh")
        .send({ refreshToken: suspendido.refreshToken });
      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ e
  describe("e) reactivar y extender", () => {
    it("reactivar vuelve a permitir escribir", async () => {
      const suspender = await plataforma(
        "post",
        `/comercios/${reac.id}/suspender`,
        { motivo: "prueba de reactivación" }
      );
      expect(suspender.status, JSON.stringify(suspender.body)).toBe(200);

      const bloqueado = await llamar("post", "/categorias", reac.token, {
        nombre: `Cat reac bloqueada ${sufijo}`,
      });
      expect(bloqueado.status).toBe(401);

      const reactivar = await plataforma(
        "post",
        `/comercios/${reac.id}/reactivar`
      );
      expect(reactivar.status, JSON.stringify(reactivar.body)).toBe(200);

      const permitido = await llamar("post", "/categorias", reac.token, {
        nombre: `Cat reac ok ${sufijo}`,
      });
      expect(permitido.status, JSON.stringify(permitido.body)).toBe(201);
    });

    it("extender vuelve a permitir escribir a un comercio vencido", async () => {
      await prisma.comercio.update({
        where: { id: reac.id },
        data: { accesoHasta: new Date(Date.now() - 10 * MS_DIA) },
      });

      const bloqueado = await llamar("post", "/categorias", reac.token, {
        nombre: `Cat reac vencida ${sufijo}`,
      });
      expect(bloqueado.status).toBe(403);

      const extender = await plataforma("post", `/comercios/${reac.id}/extender`, {
        dias: 5,
      });
      expect(extender.status, JSON.stringify(extender.body)).toBe(200);

      const permitido = await llamar("post", "/categorias", reac.token, {
        nombre: `Cat reac extendida ${sufijo}`,
      });
      expect(permitido.status, JSON.stringify(permitido.body)).toBe(201);
    });
  });

  // ------------------------------------------------------------------ f
  describe("f) aislamiento entre comercios", () => {
    it("suspender A no afecta a B", async () => {
      await prisma.comercio.update({
        where: { id: isoA.id },
        data: { activo: false },
      });

      const a = await llamar("get", "/categorias", isoA.token);
      expect(a.status).toBe(401);

      const bGet = await llamar("get", "/categorias", isoB.token);
      expect(bGet.status).toBe(200);
      const bPost = await llamar("post", "/categorias", isoB.token, {
        nombre: `Cat iso b suspendido ${sufijo}`,
      });
      expect(bPost.status, JSON.stringify(bPost.body)).toBe(201);
    });

    it("vencer A no afecta a B", async () => {
      await prisma.comercio.update({
        where: { id: isoA.id },
        data: {
          activo: true,
          accesoHasta: new Date(Date.now() - 10 * MS_DIA),
        },
      });

      const a = await llamar("post", "/categorias", isoA.token, {
        nombre: `Cat iso a vencida ${sufijo}`,
      });
      expect(a.status).toBe(403);

      const bGet = await llamar("get", "/categorias", isoB.token);
      expect(bGet.status).toBe(200);
      const bPost = await llamar("post", "/categorias", isoB.token, {
        nombre: `Cat iso b vencida ${sufijo}`,
      });
      expect(bPost.status, JSON.stringify(bPost.body)).toBe(201);
    });
  });

  // ------------------------------------------------------------------ h
  describe("h) token de plataforma", () => {
    it("sigue sin servir en las rutas de negocio (401)", async () => {
      const get = await llamar("get", "/categorias", platformToken);
      expect(get.status).toBe(401);

      const post = await llamar("post", "/categorias", platformToken, {
        nombre: `Cat plataforma ${sufijo}`,
      });
      expect(post.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ g
  describe("g) caché activa e invalidación al suspender", () => {
    beforeAll(() => {
      process.env.VIGENCIA_CACHE_SEGUNDOS = "15";
    });

    afterAll(() => {
      process.env.VIGENCIA_CACHE_SEGUNDOS = "0";
    });

    it("suspender corta al instante el token ya emitido aunque la caché esté activa", async () => {
      const primera = await llamar("get", "/categorias", cache.token);
      expect(primera.status).toBe(200);

      const suspender = await plataforma(
        "post",
        `/comercios/${cache.id}/suspender`,
        { motivo: "prueba de caché" }
      );
      expect(suspender.status, JSON.stringify(suspender.body)).toBe(200);

      const despues = await llamar("get", "/categorias", cache.token);
      expect(despues.status).toBe(401);
      expect(despues.body.mensaje).toBe(
        "La cuenta está suspendida. Contactá a soporte."
      );
    });
  });
});
