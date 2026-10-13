import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// Pruebas de integración con PostgreSQL REAL (sin mocks de BD) para la
// concurrencia de ventas y pagos. Verifican el aislamiento transaccional que
// los tests unitarios (con `$transaction` falseado) no pueden probar.
//
// ACTIVACIÓN: solo corren si existe TEST_DATABASE_URL apuntando a una base
// EXCLUSIVA y desechable de tests. Sin ella, el archivo se saltea.
// SEGURIDAD: se rehúsa a correr si TEST_DATABASE_URL coincide con DATABASE_URL
// o apunta a Neon/producción. Nunca toca `inventariobd` ni Neon.
// PREPARACIÓN (la ejecuta el operador, no este archivo):
//   TEST_DATABASE_URL="postgresql://..." npx prisma migrate deploy
//   TEST_DATABASE_URL="postgresql://..." npm test
// Solo se mockea el SDK externo de Mercado Pago (red); Prisma, servicios y
// repositorios son 100% reales.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

const paymentGetMock = vi.hoisted(() => vi.fn());
const preferenceCreateMock = vi.hoisted(() => vi.fn());

vi.mock("mercadopago", () => ({
  Preference: vi.fn().mockImplementation(function () {
    return { create: preferenceCreateMock };
  }),
  Payment: vi.fn().mockImplementation(function () {
    return { get: paymentGetMock };
  }),
}));

vi.mock("../config/mercadopago", () => ({ default: {} }));

// En el test de rollback se fuerza un fallo dentro del tx mockeando SOLO la
// creación del movimiento (el resto del repositorio sigue siendo el real).
vi.mock("../repositores/movimiento.repository", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return {
    movimientoRepository: {
      ...mod.movimientoRepository,
      create: vi.fn((...args: any[]) => mod.movimientoRepository.create(...args)),
    },
  };
});

type VentaService = typeof import("./venta.service.js")["ventaService"];
type Prisma = typeof import("../config/prisma.js")["prisma"];

describe.skipIf(!ES_BASE_EXCLUSIVA)("integración PG: concurrencia de ventas y pagos", () => {
  let ventaService!: VentaService;
  let prisma!: Prisma;
  let movimientoRepository!: typeof import("../repositores/movimiento.repository.js")["movimientoRepository"];
  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const creados = { categorias: [] as number[], productos: [] as number[], ventas: [] as number[] };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    ventaService = (await import("./venta.service.js")).ventaService;
    prisma = (await import("../config/prisma.js")).prisma;
    movimientoRepository = (await import("../repositores/movimiento.repository.js")).movimientoRepository;
    preferenceCreateMock.mockResolvedValue({ id: "pref-test", init_point: "http://test/pay" });
    // Warm-up del pool y del camino transaccional: la primera conexión TCP
    // contra PG (Docker NAT en frío) es la más lenta y no debe pagarse dentro
    // de un test con timeout. No cambia ninguna aserción.
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Limpieza solo de datos propios, en orden inverso a las FK.
    // El re-barrido de movimientos + reintento acotado cubre el caso de un tx
    // del test que confirme tarde (ej: tras un timeout): su INSERT puede
    // aparecer entre el primer barrido y el borrado de productos.
    const pids = creados.productos.splice(0);
    const vids = creados.ventas.splice(0);
    const cids = creados.categorias.splice(0);
    const borrarMovimientos = () =>
      pids.length
        ? prisma.movimientoStock.deleteMany({ where: { productoId: { in: pids } } })
        : Promise.resolve({ count: 0 });
    await borrarMovimientos();
    if (vids.length) await prisma.venta.deleteMany({ where: { id: { in: vids } } });
    if (pids.length) {
      try {
        await prisma.producto.deleteMany({ where: { id: { in: pids } } });
      } catch {
        await borrarMovimientos();
        await prisma.producto.deleteMany({ where: { id: { in: pids } } });
      }
    }
    if (cids.length) await prisma.categoria.deleteMany({ where: { id: { in: cids } } });
    vi.clearAllMocks();
    preferenceCreateMock.mockResolvedValue({ id: "pref-test", init_point: "http://test/pay" });
  });

  const crearProducto = async (stock: number, tag: string) => {
    const categoria = await prisma.categoria.create({
      data: { nombre: `test-cat-${sufijo}-${tag}` },
    });
    creados.categorias.push(categoria.id);
    const producto = await prisma.producto.create({
      data: {
        nombre: `test-prod-${sufijo}-${tag}`,
        precioCompra: 100,
        precioVenta: 200,
        stock,
        categoriaId: categoria.id,
      },
    });
    creados.productos.push(producto.id);
    return producto;
  };

  const stockDe = async (productoId: number) =>
    (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).stock;

  const salidasDe = (productoId: number) =>
    prisma.movimientoStock.count({ where: { productoId, tipo: "SALIDA" } });

  const entradasDe = (productoId: number) =>
    prisma.movimientoStock.count({ where: { productoId, tipo: "ENTRADA" } });

  it("dos webhooks simultáneos: un solo descuento y una sola SALIDA", async () => {
    const producto = await crearProducto(10, "wh");
    const { ventaId } = await ventaService.iniciarVenta({
      metodoPago: "PEDIDO_DISTANCIA",
      detalles: [{ productoId: producto.id, cantidad: 2 }],
    });
    creados.ventas.push(ventaId);
    paymentGetMock.mockResolvedValue({ id: "pay-1", external_reference: String(ventaId), status: "approved" });

    const [r1, r2] = await Promise.allSettled([
      ventaService.confirmarPago("pay-1"),
      ventaService.confirmarPago("pay-1"),
    ]);

    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("fulfilled");
    expect(await stockDe(producto.id)).toBe(8);
    expect(await salidasDe(producto.id)).toBe(1);
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: ventaId } })).estado).toBe("COMPLETADA");
  });

  it("dos ventas concurrentes: sin negativo ni updates perdidos", async () => {
    const producto = await crearProducto(3, "conc");
    const armarDto = () => ({ metodoPago: "EFECTIVO" as const, detalles: [{ productoId: producto.id, cantidad: 2 }] });

    const [r1, r2] = await Promise.allSettled([
      ventaService.iniciarVenta(armarDto()),
      ventaService.iniciarVenta(armarDto()),
    ]);

    const ok = [r1, r2].filter((r) => r.status === "fulfilled");
    const ko = [r1, r2].filter((r) => r.status === "rejected");
    // Registrar antes de aseverar: si un expect falla, la limpieza igual
    // encuentra estos ids y no deja filas huérfanas.
    for (const r of ok) creados.ventas.push((r as PromiseFulfilledResult<any>).value.ventaId);
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(await stockDe(producto.id)).toBe(1);
    expect(await salidasDe(producto.id)).toBe(1);
  });

  it("fallo dentro del tx: sin cambios parciales (rollback incluye el claim)", async () => {
    const producto = await crearProducto(10, "rb");
    const { ventaId } = await ventaService.iniciarVenta({
      metodoPago: "PEDIDO_DISTANCIA",
      detalles: [{ productoId: producto.id, cantidad: 2 }],
    });
    creados.ventas.push(ventaId);
    paymentGetMock.mockResolvedValue({ id: "pay-9", external_reference: String(ventaId), status: "approved" });
    vi.mocked(movimientoRepository.create).mockRejectedValueOnce(new Error("fallo de BD"));

    await expect(ventaService.confirmarPago("pay-9")).rejects.toThrow("fallo de BD");

    expect((await prisma.venta.findUniqueOrThrow({ where: { id: ventaId } })).estado).toBe("PENDIENTE");
    expect(await stockDe(producto.id)).toBe(10);
    expect(await salidasDe(producto.id)).toBe(0);
  });

  it("anulación concurrente: una sola reposición", async () => {
    const producto = await crearProducto(10, "an");
    const { ventaId } = await ventaService.iniciarVenta({
      metodoPago: "EFECTIVO",
      detalles: [{ productoId: producto.id, cantidad: 2 }],
    });
    creados.ventas.push(ventaId);
    expect(await stockDe(producto.id)).toBe(8);

    const [r1, r2] = await Promise.allSettled([
      ventaService.anular(ventaId, "doble clic A"),
      ventaService.anular(ventaId, "doble clic B"),
    ]);

    const ok = [r1, r2].filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect(await stockDe(producto.id)).toBe(10);
    expect(await entradasDe(producto.id)).toBe(1);
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: ventaId } })).estado).toBe("ANULADA");
  });
});
