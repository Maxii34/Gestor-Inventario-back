import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { calcularNuevoAcceso, finDeDiaArgentina } from "./utils/suscripcion";

// Integración HTTP de la consola de plataforma contra PostgreSQL real.
// Igual que aislamiento.integration.test.ts: solo corre con una base EXCLUSIVA
// y desechable (npm run test:integration), y las variables de entorno se fijan
// ANTES del import dinámico de la app porque algunos módulos las leen al cargar.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

const JWT_SECRET_TEST = "test-secret-plataforma-negocio";
const PLATAFORMA_JWT_SECRET_TEST = "test-secret-plataforma-admin";
const MS_DIA = 24 * 60 * 60 * 1000;

vi.mock("morgan", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Metodo = "get" | "post" | "put" | "delete";
type Prisma = typeof import("./config/prisma.js")["prisma"];

interface ComercioCreado {
  id: number;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

describe.skipIf(!ES_BASE_EXCLUSIVA)("integración HTTP: plataforma", () => {
  let app: import("express").Express;
  let prisma: Prisma;

  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const comercios: number[] = [];
  const superadmins: number[] = [];

  let superadminActivoId = 0;
  let superadminEmail = "";
  let superadminInactivoEmail = "";
  let superadminBEmail = "";
  let platformToken = "";

  let principal!: ComercioCreado;
  let principalToken = "";
  let productoPrincipalNombre = "";
  let clientePrincipalNombre = "";

  let suspendible!: ComercioCreado;
  let suspendibleRefreshToken = "";
  let pagos!: ComercioCreado;
  let concurrente!: ComercioCreado;
  let extension!: ComercioCreado;
  let filtroSuspendido!: ComercioCreado;

  let accesoPagosBase!: Date;
  let accesoConcurrenteBase!: Date;

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

  const plataforma = (
    metodo: Metodo,
    ruta: string,
    body?: object
  ) => llamar(metodo, `/plataforma${ruta}`, platformToken, body);

  const crearComercio = async (
    tag: string,
    extra: Record<string, unknown> = {}
  ): Promise<ComercioCreado> => {
    const slug = `plat-${tag}-${sufijo}`;
    const adminEmail = `admin-${tag}-${sufijo}@test.com`;
    const adminPassword = "123456";

    const res = await plataforma("post", "/comercios", {
      nombre: `Comercio ${tag} ${sufijo}`,
      slug,
      adminNombre: `Admin ${tag}`,
      adminEmail,
      adminPassword,
      ...extra,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const id = res.body.data.comercio.id as number;
    comercios.push(id);
    return { id, slug, adminEmail, adminPassword };
  };

  const loginComercio = (comercio: ComercioCreado) =>
    request(app).post("/usuarios/login").send({
      slug: comercio.slug,
      email: comercio.adminEmail,
      password: comercio.adminPassword,
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    process.env.JWT_SECRET = JWT_SECRET_TEST;
    process.env.PLATAFORMA_JWT_SECRET = PLATAFORMA_JWT_SECRET_TEST;

    app = (await import("./app.js")).default as unknown as import("express").Express;
    prisma = (await import("./config/prisma.js")).prisma;
    await prisma.$queryRaw`SELECT 1`;

    const hash = await bcrypt.hash("superadmin123", 10);

    const superadmin = await prisma.superadmin.create({
      data: {
        nombre: "Superadmin",
        email: `super-${sufijo}@test.com`,
        password: hash,
      },
    });
    superadmins.push(superadmin.id);
    superadminActivoId = superadmin.id;
    superadminEmail = superadmin.email;

    const inactivo = await prisma.superadmin.create({
      data: {
        nombre: "Superadmin inactivo",
        email: `inactivo-${sufijo}@test.com`,
        password: hash,
        activo: false,
      },
    });
    superadmins.push(inactivo.id);
    superadminInactivoEmail = inactivo.email;

    const superadminB = await prisma.superadmin.create({
      data: {
        nombre: "Superadmin B",
        email: `super-b-${sufijo}@test.com`,
        password: hash,
      },
    });
    superadmins.push(superadminB.id);
    superadminBEmail = superadminB.email;

    const login = await request(app).post("/plataforma/login").send({
      email: superadminEmail,
      password: "superadmin123",
    });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    platformToken = login.body.data.accessToken;

    principal = await crearComercio("principal");
    suspendible = await crearComercio("suspendible");
    pagos = await crearComercio("pagos");
    concurrente = await crearComercio("concurrente");
    extension = await crearComercio("extension");
    filtroSuspendido = await crearComercio("filtro-suspendido");

    const suspenderFiltro = await plataforma(
      "post",
      `/comercios/${filtroSuspendido.id}/suspender`,
      { motivo: "suspendido para el filtro" }
    );
    expect(suspenderFiltro.status, JSON.stringify(suspenderFiltro.body)).toBe(200);

    const loginPrincipal = await loginComercio(principal);
    expect(loginPrincipal.status, JSON.stringify(loginPrincipal.body)).toBe(200);
    principalToken = loginPrincipal.body.data.accessToken;

    const categoria = await llamar("post", "/categorias", principalToken, {
      nombre: `Categoria ${sufijo}`,
    });
    expect(categoria.status, JSON.stringify(categoria.body)).toBe(201);

    productoPrincipalNombre = `Producto ${sufijo}`;
    const producto = await llamar("post", "/productos", principalToken, {
      nombre: productoPrincipalNombre,
      precioCompra: 10,
      precioVenta: 20,
      stock: 5,
      categoriaId: categoria.body.data.id,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);

    clientePrincipalNombre = `Cliente ${sufijo}`;
    const cliente = await llamar("post", "/clientes", principalToken, {
      nombre: clientePrincipalNombre,
      apellido: "Test",
    });
    expect(cliente.status, JSON.stringify(cliente.body)).toBe(201);

    const venta = await llamar("post", "/ventas", principalToken, {
      metodoPago: "EFECTIVO",
      clienteId: cliente.body.data.id,
      detalles: [{ productoId: producto.body.data.id, cantidad: 1 }],
    });
    expect(venta.status, JSON.stringify(venta.body)).toBe(201);

    const loginSuspendible = await loginComercio(suspendible);
    expect(loginSuspendible.status, JSON.stringify(loginSuspendible.body)).toBe(200);
    suspendibleRefreshToken = loginSuspendible.body.data.refreshToken;

    accesoPagosBase = finDeDiaArgentina(new Date(Date.now() + 5 * MS_DIA));
    await prisma.comercio.update({
      where: { id: pagos.id },
      data: { accesoHasta: accesoPagosBase },
    });

    accesoConcurrenteBase = finDeDiaArgentina(new Date(Date.now() + 10 * MS_DIA));
    await prisma.comercio.update({
      where: { id: concurrente.id },
      data: { accesoHasta: accesoConcurrenteBase },
    });
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
      where: { usuario: { comercioId: { in: comercios } } },
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
  describe("a) login de plataforma", () => {
    it("acepta credenciales válidas y firma un token de 2 horas con tipo plataforma", async () => {
      const res = await request(app).post("/plataforma/login").send({
        email: superadminEmail.toUpperCase(),
        password: "superadmin123",
      });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const token = res.body.data.accessToken as string;
      expect(token).toBeTruthy();

      const payload = jwt.verify(token, PLATAFORMA_JWT_SECRET_TEST) as jwt.JwtPayload;
      expect(payload.sub).toBe(superadminActivoId);
      expect(payload.tipo).toBe("plataforma");
      expect((payload.exp as number) - (payload.iat as number)).toBe(2 * 60 * 60);
      expect(res.body.data.superadmin).not.toHaveProperty("password");
    });

    it("rechaza contraseña incorrecta con 401 genérico", async () => {
      const res = await request(app).post("/plataforma/login").send({
        email: superadminEmail,
        password: "incorrecta",
      });

      expect(res.status).toBe(401);
      expect(res.body.mensaje).toBe("Credenciales inválidas");
    });

    it("rechaza un superadmin inactivo con 401 genérico", async () => {
      const res = await request(app).post("/plataforma/login").send({
        email: superadminInactivoEmail,
        password: "superadmin123",
      });

      expect(res.status).toBe(401);
      expect(res.body.mensaje).toBe("Credenciales inválidas");
    });
  });

  // ------------------------------------------------------------------ b
  describe("b) aislamiento de tokens entre plataforma y negocio", () => {
    // Cualquier id sirve: sin token el middleware responde 401 antes de
    // resolver el comercio. Se evita leer fixtures que aún no existen.
    const endpoints: [Metodo, string][] = [
      ["get", "/plataforma/comercios"],
      ["get", "/plataforma/comercios/1"],
      ["post", "/plataforma/comercios"],
      ["post", "/plataforma/comercios/1/suspender"],
      ["post", "/plataforma/comercios/1/reactivar"],
      ["post", "/plataforma/comercios/1/extender"],
      ["post", "/plataforma/comercios/1/cambiar-plan"],
      ["post", "/plataforma/comercios/1/pagos"],
      ["get", "/plataforma/comercios/1/pagos"],
      ["get", "/plataforma/auditoria"],
      ["get", "/plataforma/metricas"],
    ];

    it.each(endpoints)("sin token: %s %s -> 401", async (metodo, ruta) => {
      const res = await llamar(metodo, ruta);
      expect(res.status).toBe(401);
    });

    it("un token de COMERCIO no sirve en /plataforma (401)", async () => {
      const res = await llamar("get", "/plataforma/metricas", principalToken);
      expect(res.status).toBe(401);
    });

    const rutasNegocio: [Metodo, string][] = [
      ["get", "/productos"],
      ["get", "/ventas"],
      ["get", "/usuarios"],
      ["get", "/estadisticas/recaudacion"],
    ];

    it.each(rutasNegocio)(
      "un token de PLATAFORMA no sirve en %s %s (401)",
      async (metodo, ruta) => {
        const res = await llamar(metodo, ruta, platformToken);
        expect(res.status).toBe(401);
      }
    );
  });

  // ------------------------------------------------------------------ c
  describe("c) suspender y reactivar", () => {
    it("suspende, revoca refresh tokens y bloquea login/refresh", async () => {
      const suspender = await plataforma(
        "post",
        `/comercios/${suspendible.id}/suspender`,
        { motivo: "falta de pago" }
      );
      expect(suspender.status, JSON.stringify(suspender.body)).toBe(200);
      expect(suspender.body.data.activo).toBe(false);
      expect(suspender.body.data.motivoSuspension).toBe("falta de pago");

      const doble = await plataforma(
        "post",
        `/comercios/${suspendible.id}/suspender`,
        { motivo: "otra vez" }
      );
      expect(doble.status).toBe(409);

      const login = await loginComercio(suspendible);
      expect(login.status).toBe(401);

      const refresh = await request(app)
        .post("/usuarios/refresh")
        .send({ refreshToken: suspendibleRefreshToken });
      expect(refresh.status).toBe(401);

      const tokens = await prisma.refreshToken.findMany({
        where: { usuario: { comercioId: suspendible.id } },
      });
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((token) => token.revocado)).toBe(true);
    });

    it("reactiva y el comercio vuelve a funcionar; reactivar dos veces da 409", async () => {
      const reactivar = await plataforma(
        "post",
        `/comercios/${suspendible.id}/reactivar`
      );
      expect(reactivar.status, JSON.stringify(reactivar.body)).toBe(200);
      expect(reactivar.body.data.activo).toBe(true);
      expect(reactivar.body.data.motivoSuspension).toBeNull();

      const doble = await plataforma(
        "post",
        `/comercios/${suspendible.id}/reactivar`
      );
      expect(doble.status).toBe(409);

      const login = await loginComercio(suspendible);
      expect(login.status, JSON.stringify(login.body)).toBe(200);

      const productos = await llamar(
        "get",
        "/productos",
        login.body.data.accessToken
      );
      expect(productos.status).toBe(200);
    });
  });

  // ------------------------------------------------------------------ d
  describe("d) extensión, pagos y concurrencia", () => {
    it("extender acumula días sobre el vencimiento actual y no cambia el plan", async () => {
      const antes = await prisma.comercio.findUniqueOrThrow({
        where: { id: extension.id },
      });
      const esperado = calcularNuevoAcceso({
        accesoHastaActual: antes.accesoHasta,
        ahora: new Date(),
        dias: 10,
      });

      const res = await plataforma(
        "post",
        `/comercios/${extension.id}/extender`,
        { dias: 10 }
      );

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(new Date(res.body.data.accesoHasta).toISOString()).toBe(
        esperado.toISOString()
      );
      expect(res.body.data.plan).toBe("PRUEBA");

      const auditoria = await prisma.auditoriaPlataforma.findFirst({
        where: { comercioId: extension.id, accion: "EXTENDER_ACCESO" },
        orderBy: { fecha: "desc" },
      });
      expect(auditoria).not.toBeNull();
      expect(auditoria!.detalle).toHaveProperty("antes");
      expect(auditoria!.detalle).toHaveProperty("despues");
    });

    it("rechaza meses fuera de 1..24 y el plan PRUEBA en pagos (400)", async () => {
      for (const meses of [0, 25]) {
        const res = await plataforma(
          "post",
          `/comercios/${pagos.id}/pagos`,
          { plan: "MENSUAL", meses, monto: 1000, metodo: "EFECTIVO" }
        );
        expect(res.status, `meses=${meses}`).toBe(400);
      }

      const prueba = await plataforma(
        "post",
        `/comercios/${pagos.id}/pagos`,
        { plan: "PRUEBA", meses: 1, monto: 1000, metodo: "EFECTIVO" }
      );
      expect(prueba.status).toBe(400);
    });

    it("un pago acumula 3 meses sobre los 5 días restantes y deja Pago + auditoría", async () => {
      const esperado = calcularNuevoAcceso({
        accesoHastaActual: accesoPagosBase,
        ahora: new Date(),
        meses: 3,
      });

      const res = await plataforma("post", `/comercios/${pagos.id}/pagos`, {
        plan: "MENSUAL",
        meses: 3,
        monto: 15000,
        metodo: "TRANSFERENCIA",
        referencia: `ref-${sufijo}`,
        nota: "pago de prueba",
      });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.plan).toBe("MENSUAL");
      expect(res.body.data.mesesAcreditados).toBe(3);
      expect(new Date(res.body.data.accesoHasta).toISOString()).toBe(
        esperado.toISOString()
      );

      const pago = await prisma.pago.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      expect(pago.comercioId).toBe(pagos.id);
      expect(pago.mesesAcreditados).toBe(3);
      expect(Number(pago.monto)).toBe(15000);

      const comercio = await prisma.comercio.findUniqueOrThrow({
        where: { id: pagos.id },
      });
      expect(comercio.plan).toBe("MENSUAL");
      expect(comercio.accesoHasta?.toISOString()).toBe(esperado.toISOString());

      const auditoria = await prisma.auditoriaPlataforma.findFirst({
        where: { comercioId: pagos.id, accion: "REGISTRAR_PAGO" },
        orderBy: { fecha: "desc" },
      });
      expect(auditoria).not.toBeNull();
      const detalle = auditoria!.detalle as {
        antes?: { accesoHasta?: string };
        despues?: { accesoHasta?: string };
      };
      expect(detalle.antes?.accesoHasta).toBe(accesoPagosBase.toISOString());
      expect(detalle.despues?.accesoHasta).toBe(esperado.toISOString());
    });

    it("dos pagos simultáneos no pierden meses (uno puede dar 409)", async () => {
      const body = {
        plan: "TRIMESTRAL",
        meses: 3,
        monto: 30000,
        metodo: "TRANSFERENCIA",
      };

      const respuestas = await Promise.all([
        plataforma("post", `/comercios/${concurrente.id}/pagos`, body),
        plataforma("post", `/comercios/${concurrente.id}/pagos`, body),
      ]);

      for (const res of respuestas) {
        expect([201, 409]).toContain(res.status);
        if (res.status === 409) {
          expect(res.body.mensaje).toBe("El comercio cambió, reintentá");
        }
      }

      const exitosos = respuestas.filter((res) => res.status === 201).length;
      expect(exitosos).toBeGreaterThanOrEqual(1);

      const pagosGuardados = await prisma.pago.findMany({
        where: { comercioId: concurrente.id },
      });
      const mesesAcreditados = pagosGuardados.reduce(
        (total, pago) => total + pago.mesesAcreditados,
        0
      );
      expect(mesesAcreditados).toBe(exitosos * 3);

      const esperado = calcularNuevoAcceso({
        accesoHastaActual: accesoConcurrenteBase,
        ahora: new Date(),
        meses: exitosos * 3,
      });
      const comercio = await prisma.comercio.findUniqueOrThrow({
        where: { id: concurrente.id },
      });
      expect(comercio.accesoHasta?.toISOString()).toBe(esperado.toISOString());
    });
  });

  // ------------------------------------------------------------------ e
  describe("e) listado, filtros, paginación y detalle", () => {
    it("filtra por estadoSuscripcion y rechaza un estado inválido", async () => {
      const suspendidos = await plataforma(
        "get",
        "/comercios?estado=SUSPENDIDO&limit=100"
      );
      expect(suspendidos.status).toBe(200);
      expect(suspendidos.body.data.length).toBeGreaterThan(0);
      expect(
        suspendidos.body.data.every(
          (comercio: { estadoSuscripcion: string }) =>
            comercio.estadoSuscripcion === "SUSPENDIDO"
        )
      ).toBe(true);
      expect(
        suspendidos.body.data.some(
          (comercio: { id: number }) => comercio.id === filtroSuspendido.id
        )
      ).toBe(true);

      const vigentes = await plataforma("get", "/comercios?estado=VIGENTE&limit=100");
      expect(vigentes.status).toBe(200);
      expect(
        vigentes.body.data.every(
          (comercio: { estadoSuscripcion: string }) =>
            comercio.estadoSuscripcion === "VIGENTE"
        )
      ).toBe(true);

      const invalido = await plataforma("get", "/comercios?estado=NO_EXISTE");
      expect(invalido.status).toBe(400);
    });

    it("busca por slug y acota el límite a 100", async () => {
      const busqueda = await plataforma(
        "get",
        `/comercios?q=${encodeURIComponent(principal.slug)}`
      );
      expect(busqueda.status).toBe(200);
      expect(
        busqueda.body.data.some(
          (comercio: { id: number }) => comercio.id === principal.id
        )
      ).toBe(true);

      const limite = await plataforma("get", "/comercios?limit=100000");
      expect(limite.status).toBe(200);
      expect(limite.body.meta.limit).toBe(100);
    });

    it("el detalle incluye pagos y auditorías, pero NO contenido de negocio", async () => {
      const res = await plataforma("get", `/comercios/${principal.id}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const detalle = res.body.data;
      expect(detalle._count.usuarios).toBeGreaterThanOrEqual(1);
      expect(detalle._count.productos).toBeGreaterThanOrEqual(1);
      expect(detalle._count.ventas).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(detalle.pagos)).toBe(true);
      expect(Array.isArray(detalle.auditorias)).toBe(true);

      expect(detalle).not.toHaveProperty("productos");
      expect(detalle).not.toHaveProperty("ventas");
      expect(detalle).not.toHaveProperty("clientes");

      const serializado = JSON.stringify(detalle);
      expect(serializado).not.toContain(productoPrincipalNombre);
      expect(serializado).not.toContain(clientePrincipalNombre);
    });
  });

  // ------------------------------------------------------------------ f
  describe("f) superadmin desactivado", () => {
    it("su token deja de servir en el siguiente request (401)", async () => {
      const login = await request(app).post("/plataforma/login").send({
        email: superadminBEmail,
        password: "superadmin123",
      });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      const token = login.body.data.accessToken as string;

      expect(
        (await llamar("get", "/plataforma/metricas", token)).status
      ).toBe(200);

      await prisma.superadmin.updateMany({
        where: { email: superadminBEmail },
        data: { activo: false },
      });

      const res = await llamar("get", "/plataforma/metricas", token);
      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ g
  describe("g) registro público cerrable", () => {
    it("con REGISTRO_PUBLICO=false responde 403 y restaura la variable", async () => {
      const anterior = process.env.REGISTRO_PUBLICO;
      process.env.REGISTRO_PUBLICO = "false";

      try {
        const slug = `cerrado-${sufijo}`;
        const res = await request(app).post("/comercios/registrar").send({
          nombre: "Registro cerrado",
          slug,
          adminNombre: "Admin",
          adminEmail: `cerrado-${sufijo}@test.com`,
          adminPassword: "123456",
        });

        expect(res.status, JSON.stringify(res.body)).toBe(403);
        expect(res.body.mensaje).toBe("El registro está cerrado");

        const creado = await prisma.comercio.findUnique({ where: { slug } });
        expect(creado).toBeNull();
      } finally {
        if (anterior === undefined) {
          delete process.env.REGISTRO_PUBLICO;
        } else {
          process.env.REGISTRO_PUBLICO = anterior;
        }
      }
    });
  });

  // ------------------------------------------------------------------ h
  describe("h) alta desde plataforma", () => {
    it("crea el comercio en PRUEBA con ~14 días y audita CREAR_COMERCIO", async () => {
      const comercio = await prisma.comercio.findUniqueOrThrow({
        where: { id: principal.id },
      });

      expect(comercio.plan).toBe("PRUEBA");
      expect(comercio.accesoHasta).not.toBeNull();

      const dias =
        (comercio.accesoHasta!.getTime() - Date.now()) / MS_DIA;
      expect(dias).toBeGreaterThan(13.5);
      expect(dias).toBeLessThanOrEqual(15.1);

      const auditoria = await prisma.auditoriaPlataforma.findFirst({
        where: { comercioId: principal.id, accion: "CREAR_COMERCIO" },
      });
      expect(auditoria).not.toBeNull();
      expect(auditoria!.superadminId).toBe(superadminActivoId);
      expect(auditoria!.detalle).toHaveProperty("antes", null);
      expect(auditoria!.detalle).toHaveProperty("despues");
    });

    it("acepta dias explícitos entre 1 y 365 y rechaza fuera de rango", async () => {
      const valido = await plataforma("post", "/comercios", {
        nombre: `Comercio dias ${sufijo}`,
        slug: `dias-${sufijo}`,
        adminNombre: "Admin dias",
        adminEmail: `dias-${sufijo}@test.com`,
        adminPassword: "123456",
        dias: 5,
      });
      expect(valido.status, JSON.stringify(valido.body)).toBe(201);
      comercios.push(valido.body.data.comercio.id);

      const invalido = await plataforma("post", "/comercios", {
        nombre: `Comercio dias invalido ${sufijo}`,
        slug: `dias-invalido-${sufijo}`,
        adminNombre: "Admin dias",
        adminEmail: `dias-invalido-${sufijo}@test.com`,
        adminPassword: "123456",
        dias: 0,
      });
      expect(invalido.status).toBe(400);
    });
  });
});
