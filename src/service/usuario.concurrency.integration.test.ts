import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Pruebas de integración con PostgreSQL REAL para la regla "un solo ADMIN
// activo por comercio". Esa regla la garantiza un índice único parcial en la
// base (migración 20261029120000_un_admin_por_comercio); los tests unitarios,
// que mockean los repositorios, no pueden probarla.
//
// ACTIVACIÓN: solo corren si existe TEST_DATABASE_URL apuntando a una base
// EXCLUSIVA y desechable de tests (se usa con `npm run test:integration`).
// SEGURIDAD: se rehúsan a correr si TEST_DATABASE_URL coincide con
// DATABASE_URL o apunta a Neon/producción.

const TEST_URL = process.env.TEST_DATABASE_URL;
const ES_BASE_EXCLUSIVA =
  !!TEST_URL &&
  TEST_URL !== process.env.DATABASE_URL &&
  !/neon\.tech/i.test(TEST_URL) &&
  !/inventariobd/i.test(TEST_URL);

type UsuarioService = typeof import("./usuario.service.js")["usuarioService"];
type Prisma = typeof import("../config/prisma.js")["prisma"];

describe.skipIf(!ES_BASE_EXCLUSIVA)("integración PG: un ADMIN activo por comercio", () => {
  let usuarioService!: UsuarioService;
  let prisma!: Prisma;
  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // Comercios creados por la suite: se borran al final junto con sus usuarios.
  const comercios: number[] = [];

  const crearComercio = async (tag: string) => {
    const comercio = await prisma.comercio.create({
      data: { nombre: `test-${tag}-${sufijo}`, slug: `test-${tag}-${sufijo}` },
    });
    comercios.push(comercio.id);
    return comercio.id;
  };

  const adminDto = (tag: string) => ({
    nombre: `Admin ${tag}`,
    email: `admin-${tag}-${sufijo}@test.com`,
    password: "123456",
    rol: "ADMIN" as const,
  });

  const adminsActivos = (comercioId: number) =>
    prisma.usuario.count({ where: { comercioId, rol: "ADMIN", activo: true } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    usuarioService = (await import("./usuario.service.js")).usuarioService;
    prisma = (await import("../config/prisma.js")).prisma;
    // Warm-up de la conexión: la primera contra PG en Docker es la más lenta.
    await prisma.$queryRaw`SELECT 1`;
  }, 30000);

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { comercioId: { in: comercios } } });
    await prisma.comercio.deleteMany({ where: { id: { in: comercios } } });
    await prisma.$disconnect();
  }, 30000);

  it("dos altas simultáneas de ADMIN en un comercio sin admin: solo una prospera", async () => {
    const comercioId = await crearComercio("carrera");

    // Las dos pasan el chequeo del service ("¿ya hay un admin?") porque
    // ninguna insertó todavía: solo el índice de la base puede frenar a la segunda.
    const [r1, r2] = await Promise.allSettled([
      usuarioService.create(adminDto("a"), comercioId),
      usuarioService.create(adminDto("b"), comercioId),
    ]);

    const exitos = [r1, r2].filter((r) => r.status === "fulfilled");
    const rechazos = [r1, r2].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    expect(exitos).toHaveLength(1);
    expect(rechazos).toHaveLength(1);
    // P2002 = violación de unicidad; el errorHandler la traduce a un 409.
    expect(rechazos[0].reason).toMatchObject({ code: "P2002" });
    expect(await adminsActivos(comercioId)).toBe(1);
  });

  it("cada comercio puede tener su propio ADMIN (la regla es por comercio)", async () => {
    const comercioA = await crearComercio("indep-a");
    const comercioB = await crearComercio("indep-b");

    await usuarioService.create(adminDto("x"), comercioA);
    await usuarioService.create(adminDto("y"), comercioB);

    expect(await adminsActivos(comercioA)).toBe(1);
    expect(await adminsActivos(comercioB)).toBe(1);
  });

  it("dar de baja al ADMIN libera el lugar para uno nuevo", async () => {
    const comercioId = await crearComercio("baja");
    const primero = await usuarioService.create(adminDto("p"), comercioId);

    // El service impide desactivar al único admin, así que la baja se simula
    // directo en la base para comprobar el WHERE "activo = true" del índice.
    await prisma.usuario.update({ where: { id: primero.id }, data: { activo: false } });

    await usuarioService.create(adminDto("q"), comercioId);

    expect(await adminsActivos(comercioId)).toBe(1);
  });

  it("la regla no limita a los VENDEDORES: puede haber varios", async () => {
    const comercioId = await crearComercio("vendedores");

    for (const tag of ["v1", "v2", "v3"]) {
      await usuarioService.create(
        { nombre: tag, email: `${tag}-${sufijo}@test.com`, password: "123456" },
        comercioId
      );
    }

    expect(
      await prisma.usuario.count({ where: { comercioId, rol: "VENDEDOR" } })
    ).toBe(3);
  });
});