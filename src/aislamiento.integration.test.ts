import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// Prueba de aislamiento entre comercios por HTTP, contra una base PostgreSQL
// REAL. Recorre el camino completo (rutas, middlewares, validators, controllers,
// services, repositorios y claves foráneas): es la versión automática de lo que
// se verificó a mano con Bruno. Lo dejo escrito para que, si un cambio futuro
// rompe la separación de datos entre comercios, este archivo falle.
//
// ACTIVACIÓN: solo corre con `npm run test:integration` (TEST_DATABASE_URL
// apuntando a una base EXCLUSIVA y desechable). Se rehúsa a correr si coincide
// con DATABASE_URL o apunta a Neon/producción.
//
// EL ORDEN DE LOS TESTS IMPORTA: comparten los datos creados en el beforeAll y
// el último test comprueba que, tras todos los "ataques", lo de A no cambió.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

const JWT_SECRET_TEST = "test-secret-aislamiento";

// Se silencia el logger HTTP para que la salida de los tests sea legible.
vi.mock("morgan", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Metodo = "get" | "post" | "put" | "delete";
type Prisma = typeof import("./config/prisma.js")["prisma"];

interface Comercio {
  slug: string;
  comercioId: number;
  adminId: number;
  token: string;
  categoriaId: number;
  productoId: number;
  clienteId: number;
  ventaId: number;
}

describe.skipIf(!ES_BASE_EXCLUSIVA)("integración HTTP: aislamiento entre comercios", () => {
  let app: import("express").Express;
  let prisma: Prisma;
  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const comercios: number[] = [];

  let A!: Comercio & {
    proveedorId: number;
    movimientoId: number;
    vendedorId: number;
    vendedorEmail: string;
    vendedorToken: string;
    nombreCategoria: string;
    nombreProveedor: string;
    dni: string;
    emailCliente: string;
  };
  let B!: Comercio;
  let snapshotA: Record<string, unknown>;

  const llamar = (metodo: Metodo, ruta: string, token?: string, body?: object) => {
    let req = request(app)[metodo](ruta);
    if (token) req = req.set("Authorization", `Bearer ${token}`);
    return body !== undefined ? req.send(body) : req;
  };

  // Crea un recurso y devuelve su id (falla el test de preparación si no da 201).
  const crear = async (ruta: string, token: string, body: object, campoId = "id") => {
    const res = await llamar("post", ruta, token, body);
    expect(res.status, `${ruta} → ${JSON.stringify(res.body)}`).toBe(201);
    return res.body.data[campoId] as number;
  };

  const registrar = async (tag: string) => {
    const slug = `iso-${tag}-${sufijo}`;
    const email = `admin-${tag}-${sufijo}@test.com`;
    const reg = await request(app).post("/comercios/registrar").send({
      nombre: `Iso ${tag}`,
      slug,
      adminNombre: `Admin ${tag}`,
      adminEmail: email,
      adminPassword: "123456",
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    comercios.push(reg.body.data.comercio.id);
    const login = await request(app)
      .post("/usuarios/login")
      .send({ slug, email, password: "123456" });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    return {
      slug,
      email,
      comercioId: reg.body.data.comercio.id as number,
      adminId: reg.body.data.administrador.id as number,
      token: login.body.data.accessToken as string,
    };
  };

  // Cantidad total de registros de una lista (paginada o no).
  const total = (res: request.Response) =>
    (res.body.meta?.total ?? res.body.data.length) as number;

  const totalesDe = async (c: Comercio) => {
    const out: Record<string, number> = {};
    for (const modulo of ["categorias", "productos", "clientes", "proveedores", "movimientos", "ventas"]) {
      const res = await llamar("get", `/${modulo}?limit=100`, c.token);
      expect(res.status).toBe(200);
      out[modulo] = total(res);
    }
    return out;
  };

  const leerEstadoA = async () => {
    const leer = async (ruta: string) => {
      const res = await llamar("get", ruta, A.token);
      expect(res.status, ruta).toBe(200);
      return res.body.data;
    };
    return {
      categoria: await leer(`/categorias/${A.categoriaId}`),
      producto: await leer(`/productos/${A.productoId}`),
      cliente: await leer(`/clientes/${A.clienteId}`),
      proveedor: await leer(`/proveedores/${A.proveedorId}`),
      movimiento: await leer(`/movimientos/${A.movimientoId}`),
      venta: await leer(`/ventas/${A.ventaId}`),
      vendedor: await leer(`/usuarios/${A.vendedorId}`),
      admin: await leer(`/usuarios/${A.adminId}`),
    };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    // Los módulos leen JWT_SECRET al cargarse: debe existir ANTES del import.
    process.env.JWT_SECRET = JWT_SECRET_TEST;
    // Cast: con module NodeNext, TypeScript tipa el `default` del import() dinámico
    // como el módulo entero; en ejecución (Vitest) es la app de Express.
    app = (await import("./app.js")).default as unknown as import("express").Express;
    prisma = (await import("./config/prisma.js")).prisma;
    await prisma.$queryRaw`SELECT 1`; // warm-up de la conexión

    // ---- Comercio A: con todos los tipos de recurso y un vendedor ----
    const baseA = await registrar("a");
    const nombreCategoria = `Bebidas-${sufijo}`;
    const nombreProveedor = `Proveedor-${sufijo}`;
    const dni = `${Date.now()}`.slice(-8);
    const emailCliente = `cliente-${sufijo}@test.com`;

    const categoriaIdA = await crear("/categorias", baseA.token, {
      nombre: nombreCategoria,
      descripcion: "Categoría de A",
    });
    const productoIdA = await crear("/productos", baseA.token, {
      nombre: `Producto A ${sufijo}`,
      precioCompra: 100,
      precioVenta: 200,
      stock: 10,
      stockMinimo: 1,
      categoriaId: categoriaIdA,
    });
    const clienteIdA = await crear("/clientes", baseA.token, {
      nombre: "Juan",
      apellido: "Pérez",
      dni,
      email: emailCliente,
    });
    const proveedorIdA = await crear("/proveedores", baseA.token, {
      nombre: nombreProveedor,
      email: `prov-a-${sufijo}@test.com`,
    });
    const movimientoIdA = await crear("/movimientos", baseA.token, {
      tipo: "ENTRADA",
      cantidad: 5,
      productoId: productoIdA,
      motivo: "Compra inicial de A",
    });
    const ventaIdA = await crear(
      "/ventas",
      baseA.token,
      {
        metodoPago: "EFECTIVO",
        clienteId: clienteIdA,
        detalles: [{ productoId: productoIdA, cantidad: 2 }],
      },
      "ventaId"
    );
    const vendedorEmail = `vendedor-a-${sufijo}@test.com`;
    const vendedorId = await crear("/usuarios", baseA.token, {
      nombre: "Vendedor A",
      email: vendedorEmail,
      password: "123456",
    });
    const loginVendedor = await request(app)
      .post("/usuarios/login")
      .send({ slug: baseA.slug, email: vendedorEmail, password: "123456" });
    expect(loginVendedor.status).toBe(200);

    A = {
      ...baseA,
      categoriaId: categoriaIdA,
      productoId: productoIdA,
      clienteId: clienteIdA,
      ventaId: ventaIdA,
      proveedorId: proveedorIdA,
      movimientoId: movimientoIdA,
      vendedorId,
      vendedorEmail,
      vendedorToken: loginVendedor.body.data.accessToken,
      nombreCategoria,
      nombreProveedor,
      dni,
      emailCliente,
    };

    // ---- Comercio B: lo mínimo para operar y para probar referencias cruzadas ----
    const baseB = await registrar("b");
    const categoriaIdB = await crear("/categorias", baseB.token, { nombre: `Snacks-${sufijo}` });
    const productoIdB = await crear("/productos", baseB.token, {
      nombre: `Producto B ${sufijo}`,
      precioCompra: 100,
      precioVenta: 200,
      stock: 10,
      categoriaId: categoriaIdB,
    });
    const clienteIdB = await crear("/clientes", baseB.token, { nombre: "Ana", apellido: "Gómez" });
    await crear("/proveedores", baseB.token, { nombre: `Proveedor-B-${sufijo}` });
    const ventaIdB = await crear(
      "/ventas",
      baseB.token,
      { metodoPago: "TARJETA", detalles: [{ productoId: productoIdB, cantidad: 1 }] },
      "ventaId"
    );
    B = {
      ...baseB,
      categoriaId: categoriaIdB,
      productoId: productoIdB,
      clienteId: clienteIdB,
      ventaId: ventaIdB,
    };

    snapshotA = await leerEstadoA();
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
    await prisma.refreshToken.deleteMany({ where: { usuario: porComercio } });
    await prisma.usuario.deleteMany({ where: porComercio });
    await prisma.comercio.deleteMany({ where: { id: { in: comercios } } });
    await prisma.$disconnect();
  }, 30000);

  // ------------------------------------------------------------------ 1
  describe("autenticación", () => {
    const protegidas: [Metodo, string][] = [
      ["get", "/categorias"], ["get", "/categorias/1"], ["post", "/categorias"],
      ["put", "/categorias/1"], ["delete", "/categorias/1"],
      ["get", "/productos"], ["get", "/productos/1"], ["post", "/productos"],
      ["put", "/productos/1"], ["delete", "/productos/1"],
      ["get", "/proveedores"], ["get", "/proveedores/1"], ["post", "/proveedores"],
      ["put", "/proveedores/1"], ["delete", "/proveedores/1"],
      ["get", "/clientes"], ["get", "/clientes/1"], ["post", "/clientes"],
      ["put", "/clientes/1"], ["delete", "/clientes/1"],
      ["get", "/movimientos"], ["get", "/movimientos/1"], ["post", "/movimientos"],
      ["put", "/movimientos/1"], ["delete", "/movimientos/1"],
      ["get", "/ventas"], ["get", "/ventas/1"], ["post", "/ventas"],
      ["put", "/ventas/1"], ["delete", "/ventas/1"], ["post", "/ventas/1/anular"],
      ["get", "/usuarios"], ["get", "/usuarios/1"], ["post", "/usuarios"],
      ["put", "/usuarios/1"], ["delete", "/usuarios/1"],
      ["get", "/estadisticas/recaudacion"],
    ];

    it.each(protegidas)("sin token: %s %s → 401", async (metodo, ruta) => {
      const res = await llamar(metodo, ruta);
      expect(res.status).toBe(401);
    });

    it("un token basura da 401", async () => {
      const res = await llamar("get", "/productos", "esto-no-es-un-jwt");
      expect(res.status).toBe(401);
    });

    it("un token firmado con otro secreto da 401", async () => {
      const falso = jwt.sign({ id: A.adminId, rol: "ADMIN", comercioId: A.comercioId }, "otro-secreto");
      const res = await llamar("get", "/productos", falso);
      expect(res.status).toBe(401);
    });

    it("un token válido pero sin comercioId (legacy) da 401", async () => {
      const legacy = jwt.sign({ id: A.adminId, rol: "ADMIN" }, JWT_SECRET_TEST);
      const res = await llamar("get", "/productos", legacy);
      expect(res.status).toBe(401);
    });

    it("el login exige el slug del comercio: el mismo email con otro slug da 401", async () => {
      const res = await request(app)
        .post("/usuarios/login")
        .send({ slug: B.slug, email: `admin-a-${sufijo}@test.com`, password: "123456" });
      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ 2
  describe("roles: un VENDEDOR no entra a las rutas de administrador", () => {
    const soloAdmin: [Metodo, string, object?][] = [
      ["post", "/categorias", { nombre: "x" }],
      ["put", "/categorias/1", { nombre: "x" }],
      ["delete", "/categorias/1"],
      ["post", "/productos", { nombre: "x" }],
      ["put", "/productos/1", { nombre: "x" }],
      ["delete", "/productos/1"],
      ["get", "/proveedores"], ["get", "/proveedores/1"],
      ["post", "/proveedores", { nombre: "x" }],
      ["put", "/proveedores/1", { nombre: "x" }],
      ["delete", "/proveedores/1"],
      ["get", "/usuarios"], ["get", "/usuarios/1"],
      ["post", "/usuarios", { nombre: "x" }],
      ["put", "/usuarios/1", { nombre: "x" }],
      ["delete", "/usuarios/1"],
      ["put", "/ventas/1", {}],
      ["delete", "/ventas/1"],
      ["post", "/ventas/1/anular", { motivo: "x" }],
    ];

    it.each(soloAdmin)("vendedor: %s %s → 403", async (metodo, ruta, body) => {
      const res = await llamar(metodo, ruta, A.vendedorToken, body);
      expect(res.status).toBe(403);
    });

    it("el vendedor sí puede consultar productos y categorías (200)", async () => {
      expect((await llamar("get", "/productos", A.vendedorToken)).status).toBe(200);
      expect((await llamar("get", "/categorias", A.vendedorToken)).status).toBe(200);
    });
  });

  // ------------------------------------------------------------------ 3
  describe("el token de B sobre recursos de A: 404 y nada cambia", () => {
    const casos: { nombre: string; metodo: Metodo; ruta: () => string; body?: object }[] = [
      { nombre: "GET categoría", metodo: "get", ruta: () => `/categorias/${A.categoriaId}` },
      { nombre: "PUT categoría", metodo: "put", ruta: () => `/categorias/${A.categoriaId}`, body: { nombre: "Hackeada" } },
      { nombre: "DELETE categoría", metodo: "delete", ruta: () => `/categorias/${A.categoriaId}` },

      { nombre: "GET producto", metodo: "get", ruta: () => `/productos/${A.productoId}` },
      { nombre: "PUT producto", metodo: "put", ruta: () => `/productos/${A.productoId}`, body: { nombre: "Hackeado" } },
      { nombre: "DELETE producto", metodo: "delete", ruta: () => `/productos/${A.productoId}` },

      { nombre: "GET cliente", metodo: "get", ruta: () => `/clientes/${A.clienteId}` },
      { nombre: "PUT cliente", metodo: "put", ruta: () => `/clientes/${A.clienteId}`, body: { nombre: "Hackeado" } },
      { nombre: "DELETE cliente", metodo: "delete", ruta: () => `/clientes/${A.clienteId}` },

      { nombre: "GET proveedor", metodo: "get", ruta: () => `/proveedores/${A.proveedorId}` },
      { nombre: "PUT proveedor", metodo: "put", ruta: () => `/proveedores/${A.proveedorId}`, body: { nombre: "Hackeado" } },
      { nombre: "DELETE proveedor", metodo: "delete", ruta: () => `/proveedores/${A.proveedorId}` },

      { nombre: "GET movimiento", metodo: "get", ruta: () => `/movimientos/${A.movimientoId}` },
      { nombre: "PUT movimiento", metodo: "put", ruta: () => `/movimientos/${A.movimientoId}`, body: { motivo: "Hackeado" } },
      { nombre: "DELETE movimiento", metodo: "delete", ruta: () => `/movimientos/${A.movimientoId}` },

      { nombre: "GET venta", metodo: "get", ruta: () => `/ventas/${A.ventaId}` },
      { nombre: "PUT venta", metodo: "put", ruta: () => `/ventas/${A.ventaId}`, body: { estado: "ANULADA" } },
      { nombre: "DELETE venta", metodo: "delete", ruta: () => `/ventas/${A.ventaId}` },
      { nombre: "ANULAR venta", metodo: "post", ruta: () => `/ventas/${A.ventaId}/anular`, body: { motivo: "hack" } },

      { nombre: "GET vendedor", metodo: "get", ruta: () => `/usuarios/${A.vendedorId}` },
      { nombre: "PUT vendedor", metodo: "put", ruta: () => `/usuarios/${A.vendedorId}`, body: { nombre: "Hackeado" } },
      { nombre: "DELETE vendedor", metodo: "delete", ruta: () => `/usuarios/${A.vendedorId}` },
      { nombre: "GET admin", metodo: "get", ruta: () => `/usuarios/${A.adminId}` },
      { nombre: "PUT admin", metodo: "put", ruta: () => `/usuarios/${A.adminId}`, body: { nombre: "Hackeado" } },
      { nombre: "DELETE admin", metodo: "delete", ruta: () => `/usuarios/${A.adminId}` },
    ];

    it.each(casos)("B → $nombre de A: 404", async (caso) => {
      const res = await llamar(caso.metodo, caso.ruta(), B.token, caso.body);
      expect(res.status, JSON.stringify(res.body)).toBe(404);
    });
  });

  // ------------------------------------------------------------------ 4
  describe("los listados de B no contienen nada de A", () => {
    const listados: { modulo: string; idDeA: () => number }[] = [
      { modulo: "categorias", idDeA: () => A.categoriaId },
      { modulo: "productos", idDeA: () => A.productoId },
      { modulo: "clientes", idDeA: () => A.clienteId },
      { modulo: "proveedores", idDeA: () => A.proveedorId },
      { modulo: "movimientos", idDeA: () => A.movimientoId },
      { modulo: "ventas", idDeA: () => A.ventaId },
      { modulo: "usuarios", idDeA: () => A.vendedorId },
    ];

    it.each(listados)("GET /$modulo con el token de B", async ({ modulo, idDeA }) => {
      const res = await llamar("get", `/${modulo}?limit=100`, B.token);
      expect(res.status).toBe(200);
      const lista = res.body.data as { id: number; comercioId?: number }[];
      expect(Array.isArray(lista)).toBe(true);
      expect(lista.length).toBeGreaterThan(0); // B tiene datos propios: no es un "vacío" engañoso
      expect(lista.some((x) => x.id === idDeA())).toBe(false);
      expect(lista.some((x) => x.comercioId === A.comercioId)).toBe(false);
    });

    it("el listado de usuarios de B no incluye a los de A", async () => {
      const res = await llamar("get", "/usuarios", B.token);
      const ids = (res.body.data as { id: number }[]).map((u) => u.id);
      expect(ids).toContain(B.adminId);
      expect(ids).not.toContain(A.adminId);
      expect(ids).not.toContain(A.vendedorId);
    });
  });

  // ------------------------------------------------------------------ 5
  describe("estadísticas", () => {
    const rango = "?desde=2000-01-01&hasta=2100-01-01";

    it("la recaudación de cada comercio suma solo sus propias ventas", async () => {
      const resA = await llamar("get", `/estadisticas/recaudacion${rango}`, A.token);
      const resB = await llamar("get", `/estadisticas/recaudacion${rango}`, B.token);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body.data.totalRecaudado).toBe(400); // 2 unidades × 200
      expect(resB.body.data.totalRecaudado).toBe(200); // 1 unidad × 200
    });
  });

  // ------------------------------------------------------------------ 6
  describe("referencias cruzadas: B no puede usar ids de A al crear", () => {
    it("producto con la categoría de A → 404", async () => {
      const antes = await totalesDe(B);
      const res = await llamar("post", "/productos", B.token, {
        nombre: "Producto cruzado",
        precioCompra: 100,
        precioVenta: 200,
        stock: 1,
        categoriaId: A.categoriaId,
      });
      expect(res.status).toBe(404);
      expect(await totalesDe(B)).toEqual(antes);
    });

    it("actualizar un producto de B con la categoría de A → 404", async () => {
      const res = await llamar("put", `/productos/${B.productoId}`, B.token, {
        categoriaId: A.categoriaId,
      });
      expect(res.status).toBe(404);
    });

    it("movimiento sobre un producto de A → 404", async () => {
      const antes = await totalesDe(B);
      const res = await llamar("post", "/movimientos", B.token, {
        tipo: "ENTRADA",
        cantidad: 1,
        productoId: A.productoId,
      });
      expect(res.status).toBe(404);
      expect(await totalesDe(B)).toEqual(antes);
    });

    it("venta con un producto de A → 404", async () => {
      const antes = await totalesDe(B);
      const res = await llamar("post", "/ventas", B.token, {
        metodoPago: "EFECTIVO",
        detalles: [{ productoId: A.productoId, cantidad: 1 }],
      });
      expect(res.status).toBe(404);
      expect(await totalesDe(B)).toEqual(antes);
    });

    it("venta con un cliente de A → 404 y el stock de B no se toca", async () => {
      const antes = await totalesDe(B);
      const stockAntes = (await llamar("get", `/productos/${B.productoId}`, B.token)).body.data.stock;
      const res = await llamar("post", "/ventas", B.token, {
        metodoPago: "EFECTIVO",
        clienteId: A.clienteId,
        detalles: [{ productoId: B.productoId, cantidad: 1 }],
      });
      expect(res.status).toBe(404);
      expect(await totalesDe(B)).toEqual(antes);
      const stockDespues = (await llamar("get", `/productos/${B.productoId}`, B.token)).body.data.stock;
      expect(stockDespues).toBe(stockAntes);
    });
  });

  // ------------------------------------------------------------------ 7
  describe("inyección de comercioId en el body: nunca cambia el dueño", () => {
    it("categorías", async () => {
      const res = await llamar("post", "/categorias", B.token, {
        nombre: `inj-cat-${sufijo}`,
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.comercioId).toBe(B.comercioId);
    });

    it("productos", async () => {
      const res = await llamar("post", "/productos", B.token, {
        nombre: `inj-prod-${sufijo}`,
        precioCompra: 100,
        precioVenta: 200,
        stock: 1,
        categoriaId: B.categoriaId,
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.comercioId).toBe(B.comercioId);
    });

    it("clientes", async () => {
      const res = await llamar("post", "/clientes", B.token, {
        nombre: "Inyectado",
        apellido: "Prueba",
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.comercioId).toBe(B.comercioId);
    });

    it("proveedores", async () => {
      const res = await llamar("post", "/proveedores", B.token, {
        nombre: `inj-prov-${sufijo}`,
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(201); // crearProveedorSchema no es strict: descarta el campo
      expect(res.body.data.comercioId).toBe(B.comercioId);
    });

    it("movimientos", async () => {
      const res = await llamar("post", "/movimientos", B.token, {
        tipo: "ENTRADA",
        cantidad: 1,
        productoId: B.productoId,
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.comercioId).toBe(B.comercioId);
    });

    it("ventas: la venta queda en B y A no puede verla", async () => {
      const res = await llamar("post", "/ventas", B.token, {
        metodoPago: "EFECTIVO",
        detalles: [{ productoId: B.productoId, cantidad: 1 }],
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(201);
      const ventaId = res.body.data.ventaId;
      const deB = await llamar("get", `/ventas/${ventaId}`, B.token);
      expect(deB.body.data.comercioId).toBe(B.comercioId);
      expect((await llamar("get", `/ventas/${ventaId}`, A.token)).status).toBe(404);
    });

    it("usuarios: el validator estricto lo rechaza (400)", async () => {
      const res = await llamar("post", "/usuarios", B.token, {
        nombre: "Inyectado",
        email: `inj-${sufijo}@test.com`,
        password: "123456",
        comercioId: A.comercioId,
      });
      expect(res.status).toBe(400);
    });
  });

  // ------------------------------------------------------------------ 8
  describe("unicidad: es por comercio, no global", () => {
    it("el mismo nombre de categoría existe en A y en B (201), pero no dos veces en A (409)", async () => {
      expect((await llamar("post", "/categorias", B.token, { nombre: A.nombreCategoria })).status).toBe(201);
      expect((await llamar("post", "/categorias", A.token, { nombre: A.nombreCategoria })).status).toBe(409);
    });

    it("el mismo nombre de proveedor existe en A y en B (201), pero no dos veces en A (409)", async () => {
      expect((await llamar("post", "/proveedores", B.token, { nombre: A.nombreProveedor })).status).toBe(201);
      expect((await llamar("post", "/proveedores", A.token, { nombre: A.nombreProveedor })).status).toBe(409);
    });

    it("el mismo dni y email de cliente existen en A y en B (201), pero no dos veces en A (409)", async () => {
      const datos = { nombre: "Juan", apellido: "Pérez", dni: A.dni, email: A.emailCliente };
      expect((await llamar("post", "/clientes", B.token, datos)).status).toBe(201);
      expect((await llamar("post", "/clientes", A.token, datos)).status).toBe(409);
    });

    it("el mismo email de usuario existe en A y en B (201), pero no dos veces en A (409)", async () => {
      const datos = { nombre: "Repetido", email: A.vendedorEmail, password: "123456" };
      expect((await llamar("post", "/usuarios", B.token, datos)).status).toBe(201);
      expect((await llamar("post", "/usuarios", A.token, datos)).status).toBe(409);
    });
  });

  // ------------------------------------------------------------------ 9
  describe("integridad referencial y paginación", () => {
    it("borrar una categoría de B con productos → 409", async () => {
      const categoriaId = await crear("/categorias", B.token, {
        nombre: `Integridad-${sufijo}`,
      });
      await crear("/productos", B.token, {
        nombre: `Producto integridad ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId,
      });

      const res = await llamar("delete", `/categorias/${categoriaId}`, B.token);

      expect(res.status, JSON.stringify(res.body)).toBe(409);
    });

    it("borrar un producto de B con movimientos y ventas → 409", async () => {
      const res = await llamar("delete", `/productos/${B.productoId}`, B.token);

      expect(res.status, JSON.stringify(res.body)).toBe(409);
    });

    it("GET /productos?limit=100000 acota el límite a 100", async () => {
      const res = await llamar("get", "/productos?limit=100000", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(100);
    });

    it("GET /productos con page y limit inválidos usa los defaults", async () => {
      const res = await llamar("get", "/productos?page=-5&limit=abc", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(10);
    });
  });

  // ------------------------------------------------------------------ 10
  describe("invariante final", () => {
    it("tras todos los ataques, lo de A es exactamente igual que al empezar", async () => {
      const ahora = await leerEstadoA();
      expect(ahora).toEqual(snapshotA);
    });

    it("la venta de A sigue COMPLETADA y su stock no se repuso", async () => {
      const venta = await llamar("get", `/ventas/${A.ventaId}`, A.token);
      expect(venta.body.data.estado).toBe("COMPLETADA");
      const producto = await llamar("get", `/productos/${A.productoId}`, A.token);
      expect(producto.body.data.stock).toBe(13); // 10 + 5 (entrada) - 2 (venta)
    });
  });
});