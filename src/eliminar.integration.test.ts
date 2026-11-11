import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

const JWT_SECRET_TEST = "test-secret-eliminar-negocio";
const PLATAFORMA_JWT_SECRET_TEST = "test-secret-eliminar-plataforma";

vi.mock("morgan", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type Metodo = "get" | "post" | "put" | "delete";
type Prisma = typeof import("./config/prisma.js")["prisma"];

interface ComercioCreado {
  id: number;
  nombre: string;
  slug: string;
  adminId: number;
  adminEmail: string;
  adminPassword: string;
}

interface BaseCreada {
  categoriaId: number;
  productoId: number;
  clienteId: number;
}

interface ConteosComercio {
  comercios: number;
  categorias: number;
  productos: number;
  movimientos: number;
  clientes: number;
  proveedores: number;
  ventas: number;
  detalles: number;
  usuarios: number;
  refreshTokens: number;
}

describe.skipIf(!ES_BASE_EXCLUSIVA)("integración HTTP: eliminar negocios y empleados", () => {
  let app: import("express").Express;
  let prisma: Prisma;

  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const comercios: number[] = [];
  const superadmins: number[] = [];

  let superadminId = 0;
  let platformToken = "";

  let objetivo!: ComercioCreado;
  let intacto!: ComercioCreado;
  let empleados!: ComercioCreado;
  let soloAdmin!: ComercioCreado;

  let objetivoToken = "";
  let intactoToken = "";
  let empleadosToken = "";
  let soloAdminToken = "";

  let objetivoBase!: BaseCreada;
  let intactoBase!: BaseCreada;
  let empleadosBase!: BaseCreada;

  let pagoObjetivoId = 0;

  let empleadoSinHistorialId = 0;
  let empleadoSinHistorialEmail = "";
  let empleadoConVentasId = 0;
  let empleadoConVentasEmail = "";
  let empleadoConVentasNombre = "";
  let empleadoConVentasToken = "";
  let ventaEmpleadoId = 0;

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
    const slug = `del-${tag}-${sufijo}`;
    const adminEmail = `admin-${tag}-${sufijo}@test.com`;
    const adminPassword = "123456";
    const nombre = `Comercio ${tag} ${sufijo}`;

    const res = await plataforma("post", "/comercios", {
      nombre,
      slug,
      adminNombre: `Admin ${tag}`,
      adminEmail,
      adminPassword,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const id = res.body.data.comercio.id as number;
    const adminId = res.body.data.administrador.id as number;
    comercios.push(id);

    return { id, nombre, slug, adminId, adminEmail, adminPassword };
  };

  const loginComercio = (comercio: ComercioCreado) =>
    request(app).post("/usuarios/login").send({
      slug: comercio.slug,
      email: comercio.adminEmail,
      password: comercio.adminPassword,
    });

  const iniciarSesion = async (comercio: ComercioCreado) => {
    const res = await loginComercio(comercio);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.accessToken as string;
  };

  const iniciarSesionCon = async (
    comercio: ComercioCreado,
    email: string,
    password: string
  ) => {
    const res = await request(app).post("/usuarios/login").send({
      slug: comercio.slug,
      email,
      password,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.accessToken as string;
  };

  const crearBase = async (token: string, tag: string): Promise<BaseCreada> => {
    const categoria = await llamar("post", "/categorias", token, {
      nombre: `Categoria ${tag} ${sufijo}`,
    });
    expect(categoria.status, JSON.stringify(categoria.body)).toBe(201);

    const producto = await llamar("post", "/productos", token, {
      nombre: `Producto ${tag} ${sufijo}`,
      precioCompra: 10,
      precioVenta: 20,
      stock: 20,
      categoriaId: categoria.body.data.id,
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);

    const cliente = await llamar("post", "/clientes", token, {
      nombre: `Cliente ${tag} ${sufijo}`,
      apellido: "Test",
    });
    expect(cliente.status, JSON.stringify(cliente.body)).toBe(201);

    return {
      categoriaId: categoria.body.data.id,
      productoId: producto.body.data.id,
      clienteId: cliente.body.data.id,
    };
  };

  const crearMovimiento = async (
    token: string,
    productoId: number,
    tag: string
  ) => {
    const res = await llamar("post", "/movimientos", token, {
      tipo: "ENTRADA",
      cantidad: 2,
      productoId,
      motivo: `Movimiento ${tag} ${sufijo}`,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };

  const crearVenta = async (
    token: string,
    base: BaseCreada
  ): Promise<number> => {
    const res = await llamar("post", "/ventas", token, {
      metodoPago: "EFECTIVO",
      clienteId: base.clienteId,
      detalles: [{ productoId: base.productoId, cantidad: 1 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.ventaId as number;
  };

  const crearProveedor = async (token: string, tag: string) => {
    const res = await llamar("post", "/proveedores", token, {
      nombre: `Proveedor ${tag} ${sufijo}`,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };

  const contarFilas = async (comercioId: number): Promise<ConteosComercio> => {
    const [
      comercios,
      categorias,
      productos,
      movimientos,
      clientes,
      proveedores,
      ventas,
      detalles,
      usuarios,
      refreshTokens,
    ] = await Promise.all([
      prisma.comercio.count({ where: { id: comercioId } }),
      prisma.categoria.count({ where: { comercioId } }),
      prisma.producto.count({ where: { comercioId } }),
      prisma.movimientoStock.count({ where: { comercioId } }),
      prisma.cliente.count({ where: { comercioId } }),
      prisma.proveedor.count({ where: { comercioId } }),
      prisma.venta.count({ where: { comercioId } }),
      prisma.detalleVenta.count({ where: { comercioId } }),
      prisma.usuario.count({ where: { comercioId } }),
      prisma.refreshToken.count({ where: { usuario: { comercioId } } }),
    ]);

    return {
      comercios,
      categorias,
      productos,
      movimientos,
      clientes,
      proveedores,
      ventas,
      detalles,
      usuarios,
      refreshTokens,
    };
  };

  const listarTodosLosPagos = async () => {
    const pagos: Array<{
      id: number;
      comercioId: number | null;
      comercioNombre: string | null;
    }> = [];

    let page = 1;
    while (true) {
      const res = await plataforma("get", `/pagos?page=${page}&limit=100`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      pagos.push(...res.body.data);

      const totalPaginas = res.body.meta.totalPaginas as number;
      if (page >= totalPaginas) break;
      page += 1;
    }

    return pagos;
  };

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
        nombre: "Superadmin eliminar",
        email: `super-eliminar-${sufijo}@test.com`,
        password: hash,
      },
    });
    superadmins.push(superadmin.id);
    superadminId = superadmin.id;

    const login = await request(app).post("/plataforma/login").send({
      email: superadmin.email,
      password: "superadmin123",
    });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    platformToken = login.body.data.accessToken;

    objetivo = await crearComercio("objetivo");
    intacto = await crearComercio("intacto");
    empleados = await crearComercio("empleados");
    soloAdmin = await crearComercio("solo-admin");

    objetivoToken = await iniciarSesion(objetivo);
    intactoToken = await iniciarSesion(intacto);
    empleadosToken = await iniciarSesion(empleados);
    soloAdminToken = await iniciarSesion(soloAdmin);

    objetivoBase = await crearBase(objetivoToken, "objetivo");
    intactoBase = await crearBase(intactoToken, "intacto");
    empleadosBase = await crearBase(empleadosToken, "empleados");

    await crearProveedor(objetivoToken, "objetivo");
    await crearMovimiento(objetivoToken, objetivoBase.productoId, "objetivo");
    await crearVenta(objetivoToken, objetivoBase);

    const empleadoObjetivo = await llamar("post", "/usuarios", objetivoToken, {
      nombre: `Empleado objetivo ${sufijo}`,
      email: `empleado-objetivo-${sufijo}@test.com`,
      password: "123456",
    });
    expect(empleadoObjetivo.status, JSON.stringify(empleadoObjetivo.body)).toBe(
      201
    );

    await crearProveedor(intactoToken, "intacto");
    await crearMovimiento(intactoToken, intactoBase.productoId, "intacto");
    await crearVenta(intactoToken, intactoBase);

    const empleadoIntacto = await llamar("post", "/usuarios", intactoToken, {
      nombre: `Empleado intacto ${sufijo}`,
      email: `empleado-intacto-${sufijo}@test.com`,
      password: "123456",
    });
    expect(empleadoIntacto.status, JSON.stringify(empleadoIntacto.body)).toBe(
      201
    );

    const pago = await plataforma("post", `/comercios/${objetivo.id}/pagos`, {
      plan: "MENSUAL",
      meses: 1,
      monto: 1000,
      metodo: "EFECTIVO",
      referencia: `pago-objetivo-${sufijo}`,
    });
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);
    pagoObjetivoId = pago.body.data.id;

    const sinHistorial = await llamar("post", "/usuarios", empleadosToken, {
      nombre: `Sin historial ${sufijo}`,
      email: `sin-historial-${sufijo}@test.com`,
      password: "123456",
      rol: "VENDEDOR",
    });
    expect(sinHistorial.status, JSON.stringify(sinHistorial.body)).toBe(201);
    empleadoSinHistorialId = sinHistorial.body.data.id;
    empleadoSinHistorialEmail = sinHistorial.body.data.email;

    empleadoConVentasNombre = `Con ventas ${sufijo}`;
    empleadoConVentasEmail = `con-ventas-${sufijo}@test.com`;
    const conVentas = await llamar("post", "/usuarios", empleadosToken, {
      nombre: empleadoConVentasNombre,
      email: empleadoConVentasEmail,
      password: "123456",
      rol: "VENDEDOR",
    });
    expect(conVentas.status, JSON.stringify(conVentas.body)).toBe(201);
    empleadoConVentasId = conVentas.body.data.id;

    empleadoConVentasToken = await iniciarSesionCon(
      empleados,
      empleadoConVentasEmail,
      "123456"
    );
    ventaEmpleadoId = await crearVenta(empleadoConVentasToken, empleadosBase);
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
    await prisma.pago.deleteMany({
      where: { registradoPorId: { in: superadmins } },
    });
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

  describe("a) validaciones para eliminar un negocio", () => {
    it("un negocio activo da 409 y no se elimina", async () => {
      const res = await plataforma(
        "post",
        `/comercios/${objetivo.id}/eliminar`,
        { confirmarSlug: objetivo.slug }
      );

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.mensaje).toBe("Suspendé el negocio antes de eliminarlo");

      const sigue = await prisma.comercio.findUnique({
        where: { id: objetivo.id },
      });
      expect(sigue).not.toBeNull();
    });

    it("sin token o con un token de comercio responde 401", async () => {
      const sinToken = await request(app)
        .post(`/plataforma/comercios/${objetivo.id}/eliminar`)
        .send({ confirmarSlug: objetivo.slug });
      expect(sinToken.status).toBe(401);

      const conComercio = await llamar(
        "post",
        `/plataforma/comercios/${objetivo.id}/eliminar`,
        objetivoToken,
        { confirmarSlug: objetivo.slug }
      );
      expect(conComercio.status).toBe(401);
    });

    it("con el negocio suspendido, un confirmarSlug incorrecto da 400", async () => {
      const suspender = await plataforma(
        "post",
        `/comercios/${objetivo.id}/suspender`,
        { motivo: `Preparar eliminación ${sufijo}` }
      );
      expect(suspender.status, JSON.stringify(suspender.body)).toBe(200);

      const res = await plataforma(
        "post",
        `/comercios/${objetivo.id}/eliminar`,
        { confirmarSlug: `${objetivo.slug}-incorrecto` }
      );

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.mensaje).toBe("El slug de confirmación no coincide");

      const sigue = await prisma.comercio.findUnique({
        where: { id: objetivo.id },
      });
      expect(sigue).not.toBeNull();
    });
  });

  describe("b) borrado completo del negocio", () => {
    it("deja sin filas al negocio eliminado y no toca a otro negocio", async () => {
      const intactoAntes = await contarFilas(intacto.id);

      const res = await plataforma(
        "post",
        `/comercios/${objetivo.id}/eliminar`,
        { confirmarSlug: objetivo.slug }
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.comercioId).toBe(objetivo.id);

      const objetivoDespues = await contarFilas(objetivo.id);
      expect(objetivoDespues).toEqual({
        comercios: 0,
        categorias: 0,
        productos: 0,
        movimientos: 0,
        clientes: 0,
        proveedores: 0,
        ventas: 0,
        detalles: 0,
        usuarios: 0,
        refreshTokens: 0,
      });

      const intactoDespues = await contarFilas(intacto.id);
      expect(intactoDespues).toEqual(intactoAntes);
      expect(intactoDespues.comercios).toBe(1);
      expect(intactoDespues.productos).toBe(1);
      expect(intactoDespues.ventas).toBe(1);
      expect(intactoDespues.movimientos).toBeGreaterThanOrEqual(1);
      expect(intactoDespues.clientes).toBe(1);
      expect(intactoDespues.proveedores).toBe(1);
      expect(intactoDespues.usuarios).toBe(2);
    });
  });

  describe("c) pagos conservados", () => {
    it("el pago sigue existiendo con comercioId null y aparece en el listado global", async () => {
      const pago = await prisma.pago.findUnique({
        where: { id: pagoObjetivoId },
      });
      expect(pago).not.toBeNull();
      expect(pago!.comercioId).toBeNull();
      expect(pago!.comercioNombre).toBe(objetivo.nombre);

      const pagos = await listarTodosLosPagos();
      const encontrado = pagos.find((item) => item.id === pagoObjetivoId);
      expect(encontrado).toBeDefined();
      expect(encontrado!.comercioId).toBeNull();
      expect(encontrado!.comercioNombre).toBe(objetivo.nombre);
    });
  });

  describe("d) auditoría", () => {
    it("registra ELIMINAR_COMERCIO con el resumen en detalle", async () => {
      const auditorias = await prisma.auditoriaPlataforma.findMany({
        where: { accion: "ELIMINAR_COMERCIO" },
      });
      const auditoria = auditorias.find((item) => {
        const detalle = item.detalle as { slug?: string } | null;
        return detalle?.slug === objetivo.slug;
      });

      expect(auditoria).toBeDefined();
      expect(auditoria!.comercioId).toBeNull();
      expect(auditoria!.superadminId).toBe(superadminId);

      const detalle = auditoria!.detalle as {
        comercioId: number;
        nombre: string;
        slug: string;
        conteos: {
          usuarios: number;
          productos: number;
          ventas: number;
          pagos: number;
        };
      };
      expect(detalle.comercioId).toBe(objetivo.id);
      expect(detalle.nombre).toBe(objetivo.nombre);
      expect(detalle.slug).toBe(objetivo.slug);
      expect(detalle.conteos).toEqual({
        usuarios: 2,
        productos: 1,
        ventas: 1,
        pagos: 1,
      });
    });
  });

  describe("e) sesión del negocio eliminado", () => {
    it("el token de ese negocio da 401 y el login también", async () => {
      const conToken = await llamar("get", "/productos", objetivoToken);
      expect(conToken.status).toBe(401);

      const login = await loginComercio(objetivo);
      expect(login.status, JSON.stringify(login.body)).toBe(401);
    });
  });

  describe("f) eliminar empleados", () => {
    it("un empleado sin historial se borra físicamente y desaparece del listado", async () => {
      const res = await llamar(
        "delete",
        `/usuarios/${empleadoSinHistorialId}`,
        empleadosToken
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.modo).toBe("ELIMINADO");

      const fila = await prisma.usuario.findUnique({
        where: { id: empleadoSinHistorialId },
      });
      expect(fila).toBeNull();

      const lista = await llamar("get", "/usuarios?limit=100", empleadosToken);
      expect(lista.status).toBe(200);
      expect(
        lista.body.data.some(
          (usuario: { id: number }) => usuario.id === empleadoSinHistorialId
        )
      ).toBe(false);
      expect(
        lista.body.data.some(
          (usuario: { email: string }) =>
            usuario.email === empleadoSinHistorialEmail
        )
      ).toBe(false);
    });

    it("un vendedor no puede eliminar usuarios (403)", async () => {
      const res = await llamar(
        "delete",
        `/usuarios/${empleados.adminId}`,
        empleadoConVentasToken
      );
      expect(res.status).toBe(403);
    });

    it("un empleado con ventas pasa a baja, no aparece en el listado y sus ventas conservan el nombre", async () => {
      const res = await llamar(
        "delete",
        `/usuarios/${empleadoConVentasId}`,
        empleadosToken
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.modo).toBe("BAJA");

      const fila = await prisma.usuario.findUnique({
        where: { id: empleadoConVentasId },
      });
      expect(fila).not.toBeNull();
      expect(fila!.activo).toBe(false);
      expect(fila!.fechaBaja).not.toBeNull();
      expect(fila!.email).toBe(`baja-${empleadoConVentasId}@stocknext.invalid`);

      const lista = await llamar("get", "/usuarios?limit=100", empleadosToken);
      expect(lista.status).toBe(200);
      expect(
        lista.body.data.some(
          (usuario: { id: number }) => usuario.id === empleadoConVentasId
        )
      ).toBe(false);

      const ventas = await llamar("get", "/ventas?limit=100", empleadosToken);
      expect(ventas.status).toBe(200);
      const venta = ventas.body.data.find(
        (item: { id: number }) => item.id === ventaEmpleadoId
      );
      expect(venta).toBeDefined();
      expect(venta.vendedor.id).toBe(empleadoConVentasId);
      expect(venta.vendedor.nombre).toBe(empleadoConVentasNombre);

      const reuso = await llamar("post", "/usuarios", empleadosToken, {
        nombre: `Reuso email ${sufijo}`,
        email: empleadoConVentasEmail,
        password: "123456",
        rol: "VENDEDOR",
      });
      expect(reuso.status, JSON.stringify(reuso.body)).toBe(201);
      expect(reuso.body.data.email).toBe(empleadoConVentasEmail);
    });

    it("el único administrador da 409", async () => {
      const hash = await bcrypt.hash("123456", 10);
      const segundoAdmin = await prisma.usuario.create({
        data: {
          nombre: `Segundo admin ${sufijo}`,
          email: `segundo-admin-${sufijo}@test.com`,
          password: hash,
          rol: "ADMIN",
          comercio: { connect: { id: soloAdmin.id } },
        },
      });

      await prisma.usuario.update({
        where: { id: soloAdmin.adminId },
        data: { activo: false },
      });

      const res = await llamar(
        "delete",
        `/usuarios/${segundoAdmin.id}`,
        soloAdminToken
      );
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.mensaje).toBe(
        "No se puede eliminar el único administrador del comercio"
      );

      const sigue = await prisma.usuario.findUnique({
        where: { id: segundoAdmin.id },
      });
      expect(sigue).not.toBeNull();
    });

    it("uno mismo da 409", async () => {
      const res = await llamar(
        "delete",
        `/usuarios/${empleados.adminId}`,
        empleadosToken
      );
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.mensaje).toBe("No podés eliminar tu propio usuario");
    });

    it("un usuario de otro negocio da 404", async () => {
      const res = await llamar(
        "delete",
        `/usuarios/${intacto.adminId}`,
        empleadosToken
      );
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.mensaje).toBe("Usuario no encontrado");
    });
  });
});
