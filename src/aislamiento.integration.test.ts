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
    const leerCategoria = async () => {
      // El detalle incluye productos relacionados, que los tests de barras crean legítimamente en A.
      const res = await llamar("get", "/categorias?limit=100", A.token);
      expect(res.status, "/categorias?limit=100").toBe(200);
      const categoria = (res.body.data as { id: number }[]).find(
        (item) => item.id === A.categoriaId
      );
      if (!categoria) {
        throw new Error(`Categoría ${A.categoriaId} no encontrada en el listado`);
      }
      return categoria;
    };
    return {
      categoria: await leerCategoria(),
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

    it("el buscador de categorías de B no encuentra la categoría de A", async () => {
      const res = await llamar(
        "get",
        `/categorias?q=${encodeURIComponent(A.nombreCategoria)}`,
        B.token
      );

      expect(res.status).toBe(200);
      expect((res.body.data as { id: number }[]).map((categoria) => categoria.id))
        .not.toContain(A.categoriaId);
    });

    it("GET /categorias?limit=1 conserva el aislamiento y limita la página", async () => {
      const res = await llamar("get", "/categorias?limit=1", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(1);
      expect((res.body.data as { id: number }[]).length).toBeLessThanOrEqual(1);
      expect((res.body.data as { id: number }[]).some((item) => item.id === A.categoriaId)).toBe(false);
    });

    it("GET /categorias?limit=100000 acota meta.limit a 100", async () => {
      const res = await llamar("get", "/categorias?limit=100000", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(100);
    });

    it("GET /categorias sin parámetros usa meta.limit 100", async () => {
      const res = await llamar("get", "/categorias", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(100);
    });

    it("el buscador de usuarios de B no encuentra a los de A", async () => {
      const res = await llamar(
        "get",
        `/usuarios?q=${encodeURIComponent(A.vendedorEmail)}`,
        B.token
      );

      expect(res.status).toBe(200);
      expect((res.body.data as { id: number }[]).map((usuario) => usuario.id))
        .not.toContain(A.vendedorId);
    });

    it("GET /usuarios?limit=1 conserva el aislamiento y limita la página", async () => {
      const res = await llamar("get", "/usuarios?limit=1", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(1);
      expect((res.body.data as { id: number }[]).length).toBeLessThanOrEqual(1);
      expect((res.body.data as { id: number }[]).some((item) => item.id === A.vendedorId)).toBe(false);
    });

    it("GET /usuarios?limit=100000 acota meta.limit a 100", async () => {
      const res = await llamar("get", "/usuarios?limit=100000", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(100);
    });

    it("GET /usuarios sin parámetros usa meta.limit 100", async () => {
      const res = await llamar("get", "/usuarios", B.token);

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(100);
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
  describe("código de barras", () => {
    const codigoA = `COD-A-${sufijo}`;
    let productoConCodigoA: number;
    let productoSinCodigoA: number;

    it("crea un producto con código de barras", async () => {
      productoConCodigoA = await crear("/productos", A.token, {
        nombre: `Producto código A ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId: A.categoriaId,
        codigoBarras: codigoA,
      });
    });

    it("busca con el token del mismo comercio (200)", async () => {
      const res = await llamar(
        "get",
        `/productos/codigo/${encodeURIComponent(codigoA)}`,
        A.token
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.id).toBe(productoConCodigoA);
      expect(res.body.data.codigoBarras).toBe(codigoA);
    });

    it("el comercio B recibe 404 al buscar el código de A", async () => {
      const res = await llamar(
        "get",
        `/productos/codigo/${encodeURIComponent(codigoA)}`,
        B.token
      );
      expect(res.status).toBe(404);
    });

    it("el mismo código se puede crear en B (201) pero no repetirlo en A (409)", async () => {
      const enB = await llamar("post", "/productos", B.token, {
        nombre: `Producto código B ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId: B.categoriaId,
        codigoBarras: codigoA,
      });
      expect(enB.status, JSON.stringify(enB.body)).toBe(201);

      const repetidoEnA = await llamar("post", "/productos", A.token, {
        nombre: `Producto código repetido ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId: A.categoriaId,
        codigoBarras: codigoA,
      });
      expect(repetidoEnA.status).toBe(409);
    });

    it("actualizar un producto de A con el código de otro de A da 409", async () => {
      productoSinCodigoA = await crear("/productos", A.token, {
        nombre: `Producto sin código ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId: A.categoriaId,
      });

      const res = await llamar("put", `/productos/${productoSinCodigoA}`, A.token, {
        codigoBarras: codigoA,
      });
      expect(res.status).toBe(409);
    });

    it("null lo quita", async () => {
      const codigoTemporal = `TEMP-${sufijo}`;
      const productoId = await crear("/productos", A.token, {
        nombre: `Producto código temporal ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId: A.categoriaId,
        codigoBarras: codigoTemporal,
      });

      const res = await llamar("put", `/productos/${productoId}`, A.token, {
        codigoBarras: null,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.codigoBarras).toBeNull();

      const busqueda = await llamar(
        "get",
        `/productos/codigo/${encodeURIComponent(codigoTemporal)}`,
        A.token
      );
      expect(busqueda.status).toBe(404);
    });

    it("un código con espacios da 400", async () => {
      const res = await llamar(
        "get",
        `/productos/codigo/${encodeURIComponent("COD A")}`,
        A.token
      );
      expect(res.status).toBe(400);
    });

    it("VENDEDOR puede buscar (200)", async () => {
      const res = await llamar(
        "get",
        `/productos/codigo/${encodeURIComponent(codigoA)}`,
        A.vendedorToken
      );
      expect(res.status).toBe(200);
    });
  });

  // ------------------------------------------------------------------ 11
  describe("producto por paquete", () => {
    let productoPorPaqueteId: number;

    it("crea un producto con el costo de la caja y calcula el costo por unidad", async () => {
      const res = await llamar("post", "/productos", A.token, {
        nombre: `Producto paquete ${sufijo}`,
        precioCompraPaquete: 5000,
        unidadesPorPaquete: 70,
        precioVenta: 200,
        stock: 5,
        categoriaId: A.categoriaId,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      productoPorPaqueteId = res.body.data.id;
      expect(res.body.data.precioCompra).toBe("71.4286");
      expect(res.body.data.precioCompraPaquete).toBe("5000");
      expect(res.body.data.unidadesPorPaquete).toBe(70);
    });

    it("lee el producto con el costo por unidad como texto", async () => {
      const res = await llamar(
        "get",
        `/productos/${productoPorPaqueteId}`,
        A.token
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.precioCompra).toBe("71.4286");
      expect(res.body.data.precioCompraPaquete).toBe("5000");
      expect(res.body.data.unidadesPorPaquete).toBe(70);
    });

    it("el alta clásica con precioCompra sigue funcionando", async () => {
      const res = await llamar("post", "/productos", A.token, {
        nombre: `Producto clasico ${sufijo}`,
        precioCompra: 100,
        precioVenta: 200,
        stock: 3,
        categoriaId: A.categoriaId,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.precioCompra).toBe("100");
      expect(res.body.data.precioCompraPaquete).toBeNull();
      expect(res.body.data.unidadesPorPaquete).toBe(1);
    });

    it("actualizar el precio del paquete recalcula el costo por unidad", async () => {
      const res = await llamar(
        "put",
        `/productos/${productoPorPaqueteId}`,
        A.token,
        { precioCompraPaquete: 7000 }
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.precioCompra).toBe("100");
      expect(res.body.data.precioCompraPaquete).toBe("7000");
      expect(res.body.data.unidadesPorPaquete).toBe(70);
    });

    it("actualizar solo las unidades recalcula el costo por unidad", async () => {
      const res = await llamar(
        "put",
        `/productos/${productoPorPaqueteId}`,
        A.token,
        { unidadesPorPaquete: 50 }
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.precioCompra).toBe("140");
      expect(res.body.data.unidadesPorPaquete).toBe(50);
    });

    it("editar el costo por unidad limpia el precio del paquete", async () => {
      const res = await llamar(
        "put",
        `/productos/${productoPorPaqueteId}`,
        A.token,
        { precioCompra: 60 }
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.precioCompra).toBe("60");
      expect(res.body.data.precioCompraPaquete).toBeNull();
      expect(res.body.data.unidadesPorPaquete).toBe(50);
    });

    it("enviar ambos costos da 400", async () => {
      const res = await llamar("post", "/productos", A.token, {
        nombre: `Producto ambos ${sufijo}`,
        precioCompra: 10,
        precioCompraPaquete: 1000,
        unidadesPorPaquete: 10,
        precioVenta: 20,
        stock: 1,
        categoriaId: A.categoriaId,
      });
      expect(res.status).toBe(400);
    });

    it("el comercio B no ve ni toca el producto por paquete de A", async () => {
      const lectura = await llamar(
        "get",
        `/productos/${productoPorPaqueteId}`,
        B.token
      );
      expect(lectura.status).toBe(404);

      const edicion = await llamar(
        "put",
        `/productos/${productoPorPaqueteId}`,
        B.token,
        { precioCompraPaquete: 1000 }
      );
      expect(edicion.status).toBe(404);

      const deA = await llamar(
        "get",
        `/productos/${productoPorPaqueteId}`,
        A.token
      );
      expect(deA.body.data.precioCompra).toBe("60");
      expect(deA.body.data.precioCompraPaquete).toBeNull();
    });
  });

  // ------------------------------------------------------------------ 12
  describe("ventas por vendedor, filtros y día argentino", () => {
    let productoSecundarioA: number;
    let ventaVendedorA: number;
    let usuarioSinVentasA: number;
    let ventaAdminA: number;
    let ventaAdmin2A: number;
    let ventaVendedorCompletadaA: number;
    let ventaVendedorAnuladaA: number;
    let ventaSinVendedorA: number;
    let ventaPendienteA: number;
    let ventaBordeA: number;

    const rangoMarzo = "?desde=2021-03-01&hasta=2021-03-31";
    const idsDe = (res: request.Response) =>
      (res.body.data as { id: number }[]).map((venta) => venta.id);

    beforeAll(async () => {
      productoSecundarioA = await crear("/productos", A.token, {
        nombre: `Producto vendedores ${sufijo}`,
        precioCompra: 50,
        precioVenta: 100,
        stock: 100,
        stockMinimo: 1,
        categoriaId: A.categoriaId,
      });

      const ventaVendedor = await llamar("post", "/ventas", A.vendedorToken, {
        metodoPago: "EFECTIVO",
        detalles: [{ productoId: productoSecundarioA, cantidad: 1 }],
      });
      expect(ventaVendedor.status, JSON.stringify(ventaVendedor.body)).toBe(201);
      ventaVendedorA = ventaVendedor.body.data.ventaId;

      usuarioSinVentasA = await crear("/usuarios", A.token, {
        nombre: "Sin Ventas A",
        email: `sin-ventas-${sufijo}@test.com`,
        password: "123456",
      });

      const crearVenta = (data: {
        total: number;
        metodoPago: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA";
        estado: "COMPLETADA" | "ANULADA" | "PENDIENTE";
        vendedorId?: number | null;
        anuladoPorId?: number | null;
        fecha: Date;
      }) =>
        prisma.venta.create({
          data: { comercioId: A.comercioId, ...data },
        });

      ventaAdminA = (
        await crearVenta({
          total: 100,
          metodoPago: "EFECTIVO",
          estado: "COMPLETADA",
          vendedorId: A.adminId,
          fecha: new Date("2021-03-10T15:00:00.000Z"),
        })
      ).id;
      ventaAdmin2A = (
        await crearVenta({
          total: 50,
          metodoPago: "TRANSFERENCIA",
          estado: "COMPLETADA",
          vendedorId: A.adminId,
          fecha: new Date("2021-03-15T15:00:00.000Z"),
        })
      ).id;
      ventaVendedorCompletadaA = (
        await crearVenta({
          total: 200,
          metodoPago: "TARJETA",
          estado: "COMPLETADA",
          vendedorId: A.vendedorId,
          fecha: new Date("2021-03-05T15:00:00.000Z"),
        })
      ).id;
      ventaVendedorAnuladaA = (
        await crearVenta({
          total: 300,
          metodoPago: "EFECTIVO",
          estado: "ANULADA",
          vendedorId: A.vendedorId,
          anuladoPorId: A.adminId,
          fecha: new Date("2021-03-20T15:00:00.000Z"),
        })
      ).id;
      ventaSinVendedorA = (
        await crearVenta({
          total: 40,
          metodoPago: "EFECTIVO",
          estado: "COMPLETADA",
          vendedorId: null,
          fecha: new Date("2021-03-12T15:00:00.000Z"),
        })
      ).id;
      ventaPendienteA = (
        await crearVenta({
          total: 999,
          metodoPago: "EFECTIVO",
          estado: "PENDIENTE",
          vendedorId: A.adminId,
          fecha: new Date("2021-03-11T15:00:00.000Z"),
        })
      ).id;
      // 23:30 del 9 de mayo en Argentina = 02:30 UTC del 10 de mayo.
      ventaBordeA = (
        await crearVenta({
          total: 77,
          metodoPago: "EFECTIVO",
          estado: "COMPLETADA",
          vendedorId: A.vendedorId,
          fecha: new Date("2021-05-10T02:30:00.000Z"),
        })
      ).id;
    }, 30000);

    describe("quién realizó la venta", () => {
      it("una venta del administrador trae nombre y rol, nunca email ni password", async () => {
        const res = await llamar("get", `/ventas/${A.ventaId}`, A.token);
        expect(res.status).toBe(200);
        expect(res.body.data.vendedor).toEqual({
          id: A.adminId,
          nombre: "Admin a",
          rol: "ADMIN",
        });
        expect(res.body.data.vendedor).not.toHaveProperty("email");
        expect(res.body.data.vendedor).not.toHaveProperty("password");
      });

      it("una venta del vendedor trae nombre y rol, nunca email ni password", async () => {
        const res = await llamar("get", `/ventas/${ventaVendedorA}`, A.token);
        expect(res.status).toBe(200);
        expect(res.body.data.vendedor).toEqual({
          id: A.vendedorId,
          nombre: "Vendedor A",
          rol: "VENDEDOR",
        });
        expect(res.body.data.vendedor).not.toHaveProperty("email");
        expect(res.body.data.vendedor).not.toHaveProperty("password");
      });

      it("el listado expone vendedor y anuladoPor solo con id, nombre y rol", async () => {
        const res = await llamar("get", `/ventas${rangoMarzo}`, A.token);
        expect(res.status).toBe(200);
        for (const venta of res.body.data as any[]) {
          if (venta.vendedor) {
            expect(Object.keys(venta.vendedor).sort()).toEqual(["id", "nombre", "rol"]);
          }
          if (venta.anuladoPor) {
            expect(Object.keys(venta.anuladoPor).sort()).toEqual(["id", "nombre", "rol"]);
          }
        }
      });

      it("el movimiento de stock trae el responsable con nombre y rol, sin email ni password", async () => {
        const res = await llamar("get", `/movimientos/${A.movimientoId}`, A.token);
        expect(res.status).toBe(200);
        expect(res.body.data.responsable).toEqual({
          id: A.adminId,
          nombre: "Admin a",
          rol: "ADMIN",
        });
        expect(res.body.data.responsable).not.toHaveProperty("email");
        expect(res.body.data.responsable).not.toHaveProperty("password");
      });
    });

    describe("filtros de GET /ventas", () => {
      it("filtra por vendedorId", async () => {
        const res = await llamar(
          "get",
          `/ventas${rangoMarzo}&vendedorId=${A.vendedorId}`,
          A.token
        );
        expect(res.status).toBe(200);
        expect(idsDe(res).sort()).toEqual(
          [ventaVendedorCompletadaA, ventaVendedorAnuladaA].sort()
        );
        expect(res.body.meta.total).toBe(2);
        expect(
          (res.body.data as any[]).every((venta) => venta.vendedor?.id === A.vendedorId)
        ).toBe(true);
      });

      it("filtra por estado", async () => {
        const completadas = await llamar(
          "get",
          `/ventas${rangoMarzo}&estado=COMPLETADA`,
          A.token
        );
        expect(idsDe(completadas).sort()).toEqual(
          [
            ventaAdminA,
            ventaAdmin2A,
            ventaVendedorCompletadaA,
            ventaSinVendedorA,
          ].sort()
        );
        expect(completadas.body.meta.total).toBe(4);

        const anuladas = await llamar(
          "get",
          `/ventas${rangoMarzo}&estado=ANULADA`,
          A.token
        );
        expect(idsDe(anuladas)).toEqual([ventaVendedorAnuladaA]);
        expect(anuladas.body.meta.total).toBe(1);
      });

      it("filtra por metodoPago", async () => {
        const res = await llamar(
          "get",
          `/ventas${rangoMarzo}&metodoPago=TARJETA`,
          A.token
        );
        expect(idsDe(res)).toEqual([ventaVendedorCompletadaA]);
      });

      it("filtra por fechas usando los bordes del día argentino", async () => {
        const res = await llamar(
          "get",
          "/ventas?desde=2021-03-15&hasta=2021-03-20",
          A.token
        );
        expect(res.status).toBe(200);
        expect(idsDe(res).sort()).toEqual(
          [ventaAdmin2A, ventaVendedorAnuladaA].sort()
        );
      });

      it("combina vendedor, estado y fechas", async () => {
        const res = await llamar(
          "get",
          `/ventas${rangoMarzo}&vendedorId=${A.vendedorId}&estado=COMPLETADA`,
          A.token
        );
        expect(idsDe(res)).toEqual([ventaVendedorCompletadaA]);
        expect(res.body.meta.total).toBe(1);
      });

      it("ignora parámetros desconocidos", async () => {
        const conDesconocido = await llamar(
          "get",
          `/ventas${rangoMarzo}&foo=bar&otro=1`,
          A.token
        );
        const sinDesconocido = await llamar("get", `/ventas${rangoMarzo}`, A.token);
        expect(conDesconocido.status).toBe(200);
        expect(conDesconocido.body.meta.total).toBe(sinDesconocido.body.meta.total);
      });

      it.each([
        ["vendedorId=0", "vendedorId=0"],
        ["vendedorId=abc", "vendedorId=abc"],
        ["desde=2021-02-31", "desde=2021-02-31&hasta=2021-03-01"],
        ["desde posterior a hasta", "desde=2021-03-31&hasta=2021-03-01"],
        ["rango de más de 366 días", "desde=2020-01-01&hasta=2021-03-01"],
        ["estado inválido", "estado=OTRO"],
        ["metodoPago inválido", "metodoPago=OTRO"],
      ])("responde 400 con %s", async (_nombre, query) => {
        const res = await llamar("get", `/ventas?${query}`, A.token);
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(typeof res.body.mensaje).toBe("string");
      });
    });

    describe("GET /estadisticas/vendedores", () => {
      it("devuelve cantidades, totales, tickets y anuladas por vendedor", async () => {
        const res = await llamar(
          "get",
          `/estadisticas/vendedores${rangoMarzo}`,
          A.token
        );
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const data = res.body.data;
        expect(data.desde).toBe("2021-03-01");
        expect(data.hasta).toBe("2021-03-31");

        const filas = data.filas as any[];
        const admin = filas.find((fila) => fila.vendedor?.id === A.adminId);
        const vendedor = filas.find((fila) => fila.vendedor?.id === A.vendedorId);
        const sinVentas = filas.find((fila) => fila.vendedor?.id === usuarioSinVentasA);
        const sinVendedor = filas.find((fila) => fila.vendedor === null);

        expect(admin).toEqual({
          vendedor: { id: A.adminId, nombre: "Admin a", rol: "ADMIN", activo: true },
          cantidadVentas: 2,
          totalVendido: 150,
          ticketPromedio: 75,
          anuladas: { cantidad: 0, total: 0 },
          ultimaVenta: "2021-03-15T15:00:00.000Z",
        });
        expect(vendedor).toEqual({
          vendedor: {
            id: A.vendedorId,
            nombre: "Vendedor A",
            rol: "VENDEDOR",
            activo: true,
          },
          cantidadVentas: 1,
          totalVendido: 200,
          ticketPromedio: 200,
          anuladas: { cantidad: 1, total: 300 },
          ultimaVenta: "2021-03-20T15:00:00.000Z",
        });
        expect(sinVentas).toEqual({
          vendedor: {
            id: usuarioSinVentasA,
            nombre: "Sin Ventas A",
            rol: "VENDEDOR",
            activo: true,
          },
          cantidadVentas: 0,
          totalVendido: 0,
          ticketPromedio: 0,
          anuladas: { cantidad: 0, total: 0 },
          ultimaVenta: null,
        });
        expect(sinVendedor).toEqual({
          vendedor: null,
          cantidadVentas: 1,
          totalVendido: 40,
          ticketPromedio: 40,
          anuladas: { cantidad: 0, total: 0 },
          ultimaVenta: "2021-03-12T15:00:00.000Z",
        });

        expect(filas[0].vendedor.id).toBe(A.vendedorId);
        expect(data.totales).toEqual({
          cantidadVentas: 3,
          totalVendido: 390,
          ticketPromedio: 130,
          anuladas: { cantidad: 1, total: 300 },
        });
      });

      it("usa el mes actual argentino cuando no recibe fechas", async () => {
        const res = await llamar("get", "/estadisticas/vendedores", A.token);
        expect(res.status).toBe(200);
        expect(res.body.data.desde).toMatch(/^\d{4}-\d{2}-01$/);
        expect(res.body.data.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("un vendedor recibe 403 y sin token 401", async () => {
        expect(
          (
            await llamar(
              "get",
              `/estadisticas/vendedores${rangoMarzo}`,
              A.vendedorToken
            )
          ).status
        ).toBe(403);
        expect(
          (await llamar("get", `/estadisticas/vendedores${rangoMarzo}`)).status
        ).toBe(401);
      });

      it("valida el rango con las mismas reglas", async () => {
        expect(
          (
            await llamar(
              "get",
              "/estadisticas/vendedores?desde=2021-02-31",
              A.token
            )
          ).status
        ).toBe(400);
        expect(
          (
            await llamar(
              "get",
              "/estadisticas/vendedores?desde=2021-03-31&hasta=2021-03-01",
              A.token
            )
          ).status
        ).toBe(400);
      });
    });

    describe("bordes de día argentino", () => {
      it("una venta de 23:30 ART cae en su día y no en el siguiente", async () => {
        const dia = await llamar(
          "get",
          "/ventas?desde=2021-05-09&hasta=2021-05-09",
          A.token
        );
        expect(idsDe(dia)).toContain(ventaBordeA);

        const siguiente = await llamar(
          "get",
          "/ventas?desde=2021-05-10&hasta=2021-05-10",
          A.token
        );
        expect(idsDe(siguiente)).not.toContain(ventaBordeA);
      });

      it("la estadística por vendedor también la ubica en su día argentino", async () => {
        const res = await llamar(
          "get",
          "/estadisticas/vendedores?desde=2021-05-09&hasta=2021-05-09",
          A.token
        );
        const fila = (res.body.data.filas as any[]).find(
          (item) => item.vendedor?.id === A.vendedorId
        );
        expect(fila.cantidadVentas).toBe(1);
        expect(fila.totalVendido).toBe(77);
      });

      it("la recaudación respeta el día de Argentina", async () => {
        const dia = await llamar(
          "get",
          "/estadisticas/recaudacion?desde=2021-05-09&hasta=2021-05-09",
          A.token
        );
        expect(dia.status).toBe(200);
        expect(dia.body.data.totalRecaudado).toBe(77);

        const siguiente = await llamar(
          "get",
          "/estadisticas/recaudacion?desde=2021-05-10&hasta=2021-05-10",
          A.token
        );
        expect(siguiente.body.data.totalRecaudado).toBe(0);
      });
    });

    describe("el comercio B no ve datos de A en filtros ni estadísticas", () => {
      it("los filtros de ventas de B no devuelven ventas de A", async () => {
        const porFecha = await llamar("get", `/ventas${rangoMarzo}`, B.token);
        expect(porFecha.status).toBe(200);
        expect(idsDe(porFecha)).toEqual([]);
        expect(porFecha.body.meta.total).toBe(0);

        const porVendedor = await llamar(
          "get",
          `/ventas${rangoMarzo}&vendedorId=${A.vendedorId}`,
          B.token
        );
        expect(idsDe(porVendedor)).toEqual([]);
        expect(porVendedor.body.meta.total).toBe(0);
      });

      it("la estadística de B no incluye usuarios ni importes de A", async () => {
        const res = await llamar(
          "get",
          `/estadisticas/vendedores${rangoMarzo}`,
          B.token
        );
        expect(res.status).toBe(200);
        const filas = res.body.data.filas as any[];
        const ids = filas
          .filter((fila) => fila.vendedor)
          .map((fila) => fila.vendedor.id);

        expect(ids).not.toContain(A.adminId);
        expect(ids).not.toContain(A.vendedorId);
        expect(ids).not.toContain(usuarioSinVentasA);
        expect(
          filas.every((fila) => fila.cantidadVentas === 0 && fila.totalVendido === 0)
        ).toBe(true);
      });
    });
  });

  // ------------------------------------------------------------------ 13
  describe("invariante final", () => {
    it("tras todos los ataques, los recursos originales de A siguen iguales", async () => {
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