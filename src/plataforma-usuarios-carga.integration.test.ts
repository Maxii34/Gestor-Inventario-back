import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

// Integración HTTP de usuarios de comercio, cambio de contraseña y carga
// masiva desde plataforma, contra PostgreSQL real. Igual que el resto de los
// tests de integración: solo corre con una base EXCLUSIVA y desechable.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

const JWT_SECRET_TEST = "test-secret-usuarios-carga";
const PLATAFORMA_JWT_SECRET_TEST = "test-secret-plataforma-usuarios-carga";
const MS_DIA = 24 * 60 * 60 * 1000;

vi.mock("morgan", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Metodo = "get" | "post" | "put" | "delete";
type Prisma = typeof import("./config/prisma.js")["prisma"];

interface ComercioCreado {
  id: number;
  slug: string;
  adminId: number;
  adminEmail: string;
  adminPassword: string;
}

interface UsuarioCreado {
  id: number;
  email: string;
  password: string;
}

describe.skipIf(!ES_BASE_EXCLUSIVA)(
  "integración HTTP: plataforma usuarios, contraseñas y carga masiva",
  () => {
    let app: import("express").Express;
    let prisma: Prisma;

    const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const comercios: number[] = [];
    const superadmins: number[] = [];

    let platformToken = "";

    let A!: ComercioCreado;
    let B!: ComercioCreado;
    let V!: ComercioCreado;

    let tokenA = "";
    let tokenB = "";
    let tokenV = "";

    let catANombre = "";
    let catAId = 0;
    let existenteNombre = "";
    let existenteCodigo = "";

    let editable!: UsuarioCreado;
    let desactivable!: UsuarioCreado;
    let reseteable!: UsuarioCreado;
    let reseteableTempToken = "";
    let reseteableTempPassword = "";
    let reseteableTempRefresh = "";

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

    const crearComercio = async (tag: string): Promise<ComercioCreado> => {
      const slug = `usu-carga-${tag}-${sufijo}`;
      const adminEmail = `admin-${tag}-${sufijo}@test.com`;
      const adminPassword = "123456";

      const res = await plataforma("post", "/comercios", {
        nombre: `Comercio ${tag} ${sufijo}`,
        slug,
        adminNombre: `Admin ${tag}`,
        adminEmail,
        adminPassword,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);

      const id = res.body.data.comercio.id as number;
      comercios.push(id);
      return {
        id,
        slug,
        adminId: res.body.data.administrador.id as number,
        adminEmail,
        adminPassword,
      };
    };

    const loginComercio = (comercio: ComercioCreado, email: string, password: string) =>
      request(app)
        .post("/usuarios/login")
        .send({ slug: comercio.slug, email, password });

    const crearUsuario = async (
      token: string,
      nombre: string,
      email: string
    ): Promise<UsuarioCreado> => {
      const password = "123456";
      const res = await llamar("post", "/usuarios", token, {
        nombre,
        email,
        password,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return { id: res.body.data.id as number, email, password };
    };

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
          nombre: "Superadmin",
          email: `super-${sufijo}@test.com`,
          password: hash,
        },
      });
      superadmins.push(superadmin.id);

      const loginPlataforma = await request(app).post("/plataforma/login").send({
        email: superadmin.email,
        password: "superadmin123",
      });
      expect(loginPlataforma.status, JSON.stringify(loginPlataforma.body)).toBe(200);
      platformToken = loginPlataforma.body.data.accessToken;

      A = await crearComercio("a");
      B = await crearComercio("b");
      V = await crearComercio("vencido");

      const loginA = await loginComercio(A, A.adminEmail, A.adminPassword);
      expect(loginA.status, JSON.stringify(loginA.body)).toBe(200);
      tokenA = loginA.body.data.accessToken;

      const loginB = await loginComercio(B, B.adminEmail, B.adminPassword);
      expect(loginB.status, JSON.stringify(loginB.body)).toBe(200);
      tokenB = loginB.body.data.accessToken;

      const loginV = await loginComercio(V, V.adminEmail, V.adminPassword);
      expect(loginV.status, JSON.stringify(loginV.body)).toBe(200);
      tokenV = loginV.body.data.accessToken;

      editable = await crearUsuario(
        tokenA,
        "Editable",
        `editable-${sufijo}@test.com`
      );
      desactivable = await crearUsuario(
        tokenA,
        "Desactivable",
        `desactivable-${sufijo}@test.com`
      );
      reseteable = await crearUsuario(
        tokenA,
        "Reseteable",
        `reseteable-${sufijo}@test.com`
      );

      catANombre = `Bebidas A ${sufijo}`;
      const catA = await llamar("post", "/categorias", tokenA, {
        nombre: catANombre,
      });
      expect(catA.status, JSON.stringify(catA.body)).toBe(201);
      catAId = catA.body.data.id;

      const catB = await llamar("post", "/categorias", tokenB, {
        nombre: `Bebidas B ${sufijo}`,
      });
      expect(catB.status, JSON.stringify(catB.body)).toBe(201);

      existenteNombre = `Producto Existente ${sufijo}`;
      existenteCodigo = `EXIST-${sufijo}`;
      const productoA = await llamar("post", "/productos", tokenA, {
        nombre: existenteNombre,
        precioCompra: 10,
        precioVenta: 20,
        stock: 10,
        categoriaId: catAId,
        codigoBarras: existenteCodigo,
      });
      expect(productoA.status, JSON.stringify(productoA.body)).toBe(201);

      const productoB = await llamar("post", "/productos", tokenB, {
        nombre: `Producto B ${sufijo}`,
        precioCompra: 10,
        precioVenta: 20,
        stock: 5,
        categoriaId: catB.body.data.id,
      });
      expect(productoB.status, JSON.stringify(productoB.body)).toBe(201);

      await prisma.comercio.update({
        where: { id: V.id },
        data: { accesoHasta: new Date(Date.now() - 10 * MS_DIA) },
      });
    }, 60000);

    afterAll(async () => {
      if (!prisma) return;
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
    describe("a) listar usuarios de un comercio", () => {
      it("lista sin exponer el hash ni la contraseña", async () => {
        const res = await plataforma(
          "get",
          `/comercios/${A.id}/usuarios?limit=100`
        );
        expect(res.status, JSON.stringify(res.body)).toBe(200);

        const usuarios = res.body.data as {
          id: number;
          debeCambiarPassword: boolean;
          fechaCreacion: string;
          password?: string;
        }[];
        expect(usuarios.some((usuario) => usuario.id === A.adminId)).toBe(true);
        expect(usuarios.some((usuario) => usuario.id === editable.id)).toBe(true);

        for (const usuario of usuarios) {
          expect(usuario).not.toHaveProperty("password");
          expect(usuario).toHaveProperty("debeCambiarPassword");
          expect(usuario).toHaveProperty("fechaCreacion");
        }
        expect(JSON.stringify(res.body)).not.toContain("$2b$");
      });

      it("el token de un comercio o la ausencia de token dan 401", async () => {
        const conTokenComercio = await llamar(
          "get",
          `/plataforma/comercios/${A.id}/usuarios`,
          tokenA
        );
        expect(conTokenComercio.status).toBe(401);

        const sinToken = await llamar(
          "get",
          `/plataforma/comercios/${A.id}/usuarios`
        );
        expect(sinToken.status).toBe(401);
      });
    });

    // ------------------------------------------------------------------ b
    describe("b) editar usuarios", () => {
      it("edita nombre y email, normalizando el email a minúsculas", async () => {
        const emailNuevo = `EDITADO-${sufijo}@TEST.COM`;
        const res = await plataforma(
          "put",
          `/comercios/${A.id}/usuarios/${editable.id}`,
          { nombre: "Editado", email: emailNuevo }
        );

        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.data.nombre).toBe("Editado");
        expect(res.body.data.email).toBe(emailNuevo.toLowerCase());
        expect(res.body.data).not.toHaveProperty("password");
      });

      it("no deja al comercio sin un ADMIN activo (409)", async () => {
        const res = await plataforma(
          "put",
          `/comercios/${A.id}/usuarios/${A.adminId}`,
          { activo: false }
        );
        expect(res.status).toBe(409);
      });

      it("ascender a ADMIN con otro admin activo da 409", async () => {
        const res = await plataforma(
          "put",
          `/comercios/${A.id}/usuarios/${editable.id}`,
          { rol: "ADMIN" }
        );
        expect(res.status).toBe(409);
      });

      it("desactivar revoca todos los refresh tokens del usuario", async () => {
        const login = await loginComercio(
          A,
          desactivable.email,
          desactivable.password
        );
        expect(login.status, JSON.stringify(login.body)).toBe(200);
        const refreshToken = login.body.data.refreshToken as string;

        const res = await plataforma(
          "put",
          `/comercios/${A.id}/usuarios/${desactivable.id}`,
          { activo: false }
        );
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.data.activo).toBe(false);

        const refresh = await request(app)
          .post("/usuarios/refresh")
          .send({ refreshToken });
        expect(refresh.status).toBe(401);

        const tokens = await prisma.refreshToken.findMany({
          where: { usuarioId: desactivable.id },
        });
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.every((token) => token.revocado)).toBe(true);
      });

      it("un usuario de otro comercio da 404", async () => {
        const res = await plataforma(
          "put",
          `/comercios/${A.id}/usuarios/${B.adminId}`,
          { nombre: "Hackeado" }
        );
        expect(res.status).toBe(404);
      });
    });

    // ------------------------------------------------------------------ c
    describe("c) resetear contraseña", () => {
      it("devuelve la temporal una vez, rota login/refresh y audita sin la clave", async () => {
        const loginViejo = await loginComercio(
          A,
          reseteable.email,
          reseteable.password
        );
        expect(loginViejo.status, JSON.stringify(loginViejo.body)).toBe(200);
        const refreshViejo = loginViejo.body.data.refreshToken as string;

        const res = await plataforma(
          "post",
          `/comercios/${A.id}/usuarios/${reseteable.id}/resetear-password`
        );
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.headers["cache-control"]).toContain("no-store");

        const passwordTemporal = res.body.data.passwordTemporal as string;
        expect(typeof passwordTemporal).toBe("string");
        expect(passwordTemporal).toHaveLength(12);

        const loginViejoRechazado = await loginComercio(
          A,
          reseteable.email,
          reseteable.password
        );
        expect(loginViejoRechazado.status).toBe(401);

        const loginTemporal = await loginComercio(
          A,
          reseteable.email,
          passwordTemporal
        );
        expect(loginTemporal.status, JSON.stringify(loginTemporal.body)).toBe(200);
        expect(loginTemporal.body.data.usuario.debeCambiarPassword).toBe(true);

        reseteableTempToken = loginTemporal.body.data.accessToken;
        reseteableTempPassword = passwordTemporal;
        reseteableTempRefresh = loginTemporal.body.data.refreshToken;

        const refreshRevocado = await request(app)
          .post("/usuarios/refresh")
          .send({ refreshToken: refreshViejo });
        expect(refreshRevocado.status).toBe(401);

        const auditoria = await prisma.auditoriaPlataforma.findFirst({
          where: { comercioId: A.id, accion: "RESETEAR_PASSWORD" },
          orderBy: { id: "desc" },
        });
        expect(auditoria).not.toBeNull();
        expect(auditoria!.detalle).toEqual({ usuarioId: reseteable.id });
        expect(JSON.stringify(auditoria!.detalle)).not.toContain(passwordTemporal);
        expect(JSON.stringify(auditoria!.detalle)).not.toContain("$2b$");
      });
    });

    // ------------------------------------------------------------------ d
    describe("d) cambio de contraseña propio", () => {
      it("con contraseña actual incorrecta da 401", async () => {
        const res = await llamar(
          "post",
          "/usuarios/cambiar-password",
          reseteableTempToken,
          { passwordActual: "incorrecta", passwordNueva: "NuevaClave123" }
        );
        expect(res.status).toBe(401);
      });

      it("con la nueva igual a la actual da 400", async () => {
        const res = await llamar(
          "post",
          "/usuarios/cambiar-password",
          reseteableTempToken,
          {
            passwordActual: reseteableTempPassword,
            passwordNueva: reseteableTempPassword,
          }
        );
        expect(res.status).toBe(400);
      });

      it("cambia la clave, limpia el flag, revoca tokens viejos y devuelve tokens nuevos", async () => {
        const nueva = "NuevaClave123";
        const res = await llamar(
          "post",
          "/usuarios/cambiar-password",
          reseteableTempToken,
          { passwordActual: reseteableTempPassword, passwordNueva: nueva }
        );

        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.data.accessToken).toBeTruthy();
        expect(res.body.data.refreshToken).toBeTruthy();

        const usuario = await prisma.usuario.findUniqueOrThrow({
          where: { id: reseteable.id },
        });
        expect(usuario.debeCambiarPassword).toBe(false);

        const refreshViejo = await request(app)
          .post("/usuarios/refresh")
          .send({ refreshToken: reseteableTempRefresh });
        expect(refreshViejo.status).toBe(401);

        const loginNuevo = await loginComercio(A, reseteable.email, nueva);
        expect(loginNuevo.status, JSON.stringify(loginNuevo.body)).toBe(200);
        expect(loginNuevo.body.data.usuario.debeCambiarPassword).toBe(false);
      });

      it("funciona aunque el comercio esté VENCIDO", async () => {
        const res = await llamar(
          "post",
          "/usuarios/cambiar-password",
          tokenV,
          {
            passwordActual: V.adminPassword,
            passwordNueva: "ClaveVencida123",
          }
        );
        expect(res.status, JSON.stringify(res.body)).toBe(200);

        const login = await loginComercio(V, V.adminEmail, "ClaveVencida123");
        expect(login.status, JSON.stringify(login.body)).toBe(200);
      });
    });

    // ------------------------------------------------------------------ e
    describe("e) carga masiva", () => {
      it("crea 50 categorías y audita solo cantidad/simulación", async () => {
        const categorias = Array.from({ length: 50 }, (_, i) => ({
          nombre: `MasivaCat-${sufijo}-${i}`,
        }));

        const res = await plataforma(
          "post",
          `/comercios/${A.id}/categorias/masivo`,
          { categorias }
        );
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.body.data.creados).toBe(50);

        const enBase = await prisma.categoria.count({
          where: {
            comercioId: A.id,
            nombre: { startsWith: `MasivaCat-${sufijo}-` },
          },
        });
        expect(enBase).toBe(50);

        const auditoria = await prisma.auditoriaPlataforma.findFirst({
          where: { comercioId: A.id, accion: "CARGA_MASIVA_CATEGORIAS" },
          orderBy: { id: "desc" },
        });
        expect(auditoria).not.toBeNull();
        expect(auditoria!.detalle).toEqual({
          cantidad: 50,
          simulacion: false,
        });
      });

      it("rechaza 0 y 51 filas (400)", async () => {
        const cero = await plataforma(
          "post",
          `/comercios/${A.id}/categorias/masivo`,
          { categorias: [] }
        );
        expect(cero.status).toBe(400);

        const cincuentaYUno = await plataforma(
          "post",
          `/comercios/${A.id}/categorias/masivo`,
          {
            categorias: Array.from({ length: 51 }, (_, i) => ({
              nombre: `Excedida-${sufijo}-${i}`,
            })),
          }
        );
        expect(cincuentaYUno.status).toBe(400);
      });

      it("simular valida pero no escribe ni audita", async () => {
        const antes = await prisma.categoria.count({
          where: { comercioId: A.id },
        });

        const res = await plataforma(
          "post",
          `/comercios/${A.id}/categorias/masivo`,
          {
            categorias: [
              { nombre: `Simulada-${sufijo}-1` },
              { nombre: `Simulada-${sufijo}-2` },
            ],
            simular: true,
          }
        );

        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.data).toEqual({ validas: 2, simulacion: true });

        const despues = await prisma.categoria.count({
          where: { comercioId: A.id },
        });
        expect(despues).toBe(antes);

        const auditorias = await prisma.auditoriaPlataforma.findMany({
          where: {
            comercioId: A.id,
            accion: "CARGA_MASIVA_CATEGORIAS",
          },
        });
        expect(
          auditorias.every(
            (auditoria) =>
              (auditoria.detalle as { simulacion?: boolean } | null)
                ?.simulacion !== true
          )
        ).toBe(true);
      });

      it("devuelve todos los errores por fila y no escribe nada", async () => {
        const antes = await prisma.producto.count({
          where: { comercioId: A.id },
        });

        const productos = [
          {
            nombre: `Dup-${sufijo}`,
            precioCompra: 10,
            precioVenta: 20,
            stock: 1,
            categoria: catANombre,
            codigoBarras: `DUP-${sufijo}`,
          },
          {
            nombre: `Dup-${sufijo}`,
            precioCompra: 10,
            precioVenta: 20,
            stock: 1,
            categoria: catANombre,
            codigoBarras: `DUP-${sufijo}`,
          },
          {
            nombre: existenteNombre,
            precioCompra: 10,
            precioVenta: 20,
            stock: 1,
            categoria: catANombre,
            codigoBarras: `NUEVO-${sufijo}-3`,
          },
          {
            nombre: `SinCategoria-${sufijo}`,
            precioCompra: 10,
            precioVenta: 20,
            stock: 1,
            categoria: `NoExiste-${sufijo}`,
          },
          {
            nombre: `PrecioInvalido-${sufijo}`,
            precioCompra: 100,
            precioVenta: 50,
            stock: 1,
            categoria: catANombre,
          },
          {
            nombre: `CodigoExistente-${sufijo}`,
            precioCompra: 10,
            precioVenta: 20,
            stock: 1,
            categoria: catANombre,
            codigoBarras: existenteCodigo,
          },
        ];

        const res = await plataforma(
          "post",
          `/comercios/${A.id}/productos/masivo`,
          { productos }
        );

        expect(res.status).toBe(400);
        expect(res.body.mensaje).toBe(
          "Hay filas con errores: no se cargó nada"
        );

        const errores = res.body.data.errores as { fila: number; campo?: string }[];
        expect(new Set(errores.map((error) => error.fila))).toEqual(
          new Set([2, 3, 4, 5, 6])
        );
        expect(errores.length).toBeGreaterThanOrEqual(5);
        expect(
          errores.some((error) => error.campo === "precioVenta")
        ).toBe(true);
        expect(errores.some((error) => error.campo === "categoria")).toBe(true);
        expect(
          errores.some((error) => error.campo === "codigoBarras")
        ).toBe(true);

        const despues = await prisma.producto.count({
          where: { comercioId: A.id },
        });
        expect(despues).toBe(antes);
      });

      it("un error en la fila 50 deshace las 49 anteriores", async () => {
        const antes = await prisma.producto.count({
          where: { comercioId: A.id },
        });

        const productos = Array.from({ length: 50 }, (_, i) => {
          if (i === 49) {
            return {
              nombre: `Rollback-${sufijo}-${i}`,
              precioCompra: 10,
              precioVenta: 20,
              stock: 1,
              categoria: `NoExiste-${sufijo}`,
            };
          }
          return {
            nombre: `Rollback-${sufijo}-${i}`,
            precioCompra: 10,
            precioVenta: 20,
            stock: 1,
            categoria: catANombre,
            codigoBarras: `RB-${sufijo}-${i}`,
          };
        });

        const res = await plataforma(
          "post",
          `/comercios/${A.id}/productos/masivo`,
          { productos }
        );
        expect(res.status).toBe(400);

        const despues = await prisma.producto.count({
          where: { comercioId: A.id },
        });
        expect(despues).toBe(antes);
      });

      it("crea 50 productos solo en A, visibles con su token, y B sigue igual", async () => {
        const [prodBAntes, catBAntes] = await Promise.all([
          prisma.producto.count({ where: { comercioId: B.id } }),
          prisma.categoria.count({ where: { comercioId: B.id } }),
        ]);

        const productos = Array.from({ length: 50 }, (_, i) => ({
          nombre: `MasivoProd-${sufijo}-${i}`,
          precioCompra: 10,
          precioVenta: 20,
          stock: 2,
          categoria: catANombre,
          codigoBarras: `MP-${sufijo}-${i}`,
        }));

        const res = await plataforma(
          "post",
          `/comercios/${A.id}/productos/masivo`,
          { productos }
        );
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(res.body.data.creados).toBe(50);

        const listado = await llamar("get", "/productos?limit=100", tokenA);
        expect(listado.status).toBe(200);
        expect(
          (listado.body.data as { nombre: string }[]).some(
            (producto) => producto.nombre === `MasivoProd-${sufijo}-0`
          )
        ).toBe(true);

        const [prodBDespues, catBDespues] = await Promise.all([
          prisma.producto.count({ where: { comercioId: B.id } }),
          prisma.categoria.count({ where: { comercioId: B.id } }),
        ]);
        expect(prodBDespues).toBe(prodBAntes);
        expect(catBDespues).toBe(catBAntes);

        const auditoria = await prisma.auditoriaPlataforma.findFirst({
          where: { comercioId: A.id, accion: "CARGA_MASIVA_PRODUCTOS" },
          orderBy: { id: "desc" },
        });
        expect(auditoria).not.toBeNull();
        expect(auditoria!.detalle).toEqual({
          cantidad: 50,
          simulacion: false,
        });
      });

      it("un token de comercio da 401", async () => {
        const res = await llamar(
          "post",
          `/plataforma/comercios/${A.id}/productos/masivo`,
          tokenA,
          { productos: [] }
        );
        expect(res.status).toBe(401);
      });
    });
  }
);
