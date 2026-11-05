# IMPLEMENTATION_PLAN — SaaS multiempresa por etapas

> Plan de ejecución **en orden**. No ejecuta cambios por sí mismo: cada etapa
> indica qué tocar, en qué archivos reales, y cómo validarla. Hoy el código sigue
> monocomercio; este plan es la única vía autorizada para modificarlo.
> Reglas: `../SAAS_RULES.md`. Diseño: `TECHNICAL_DESIGN.md` §3–§5.
> Restricciones vigentes durante todo el plan: no tocar BD reales fuera de su etapa,
> no commitear secretos, no hacer commits/merges automáticos, no implementar
> facturación fiscal ni suscripciones.

## Etapa 0 — Higiene de seguridad pre-SaaS (bloqueante, sin schema)

**Objetivo:** cerrar filtraciones que harían inseguro cualquier SaaS.
**Toca:** `Dockerfile`, `src/app.ts`, `src/routes/estadistica.routes.ts`,
`src/middlewares/*`, `package.json` (nuevas deps `helmet`, `express-rate-limit`).

1. Rotar la credencial de BD expuesta en `Dockerfile:16` y eliminar el
   `DATABASE_URL` hardcodeado (usar solo runtime `env_file`/secretos del entorno).
2. Proteger `GET /estadisticas/recaudacion` con `verificarToken` (ya importado,
   hoy sin usar) + validación Zod de `desde/hasta`.
3. `cors({ origin: [FRONTEND_URL] })`, `helmet()`, `express.json({ limit: "100kb" })`,
   `morgan` solo en dev, `rate-limit` en `login/refresh`, fail-fast si falta
   `JWT_SECRET` (hoy `as string` en `usuario.service.ts:28` y `auth.middleware.ts:5`).
4. Extender `validate` a `params/query` (hoy solo `body`): schemas `id`, `page/limit`
   (tope 50), fechas.

**Validación:** `npm test` en verde; `curl` sin token a `/estadisticas/recaudacion`
→ `401`; `curl` con `Origin` no permitido → bloqueado; `login` con 11 intentos
rápidos → `429`; arranque sin `JWT_SECRET` → falla explícita, no `500` tardío.

## Etapa 1 — Esquema multiempresa + migración con backfill (con schema)

**Objetivo:** crear `Comercio` y `comercioId` + trazabilidad, sin romper datos.
**Toca:** `prisma/schema.prisma` + **una** migración (más `CHECK stock>=0`,
`@@unique/@@index` compuestos, `Venta.fechaActualizacion`, `onDelete` explícitos).
Ver `TECHNICAL_DESIGN.md` §3.

Orden SQL sugerido: `CREATE TABLE Comercio` → crear comercio legado
("Comercio inicial — migrar") → `ADD comercioId NOT NULL DEFAULT <legado>` por tabla
→ backfill `vendedorId/responsableId` (sistema o primer admin; documentar) →
`ADD constraints/índices/uniques` → `DROP DEFAULT` temporal → `prisma generate`.

**Validación:** `npx prisma migrate dev` en entorno **local/efímero** (nunca prod
real en esta fase) OK; `prisma validate` OK; `SELECT count(*) WHERE comercioId IS NULL = 0`
en las 7 tablas; `npm test` en verde (tests viejos aún monocomercio, deben seguir pasando
o actualizarse explícitamente en la etapa 6).

## Etapa 2 — Auth y scope por comercio

**Objetivo:** el token identifica comercio y el request lo impone.
**Toca:** `src/service/usuario.service.ts` (JWT `{ id, rol, comercioId }`,
`findByEmail` → `findFirst where { email, comercioId }`, regla admin **por comercio**),
`src/middlewares/auth.middleware.ts` (`req.auth`, revalidación `activo+comercio`,
helper `requireComercio`), nuevo `POST /comercios` (alta: `Comercio + primer ADMIN` en tx).

**Validación:** login devuelve `comercioId`; token viejo sin `comercioId` → `401`;
usuario desactivado → `401` en siguiente request aunque el JWT no expiró;
dos comercios pueden tener el mismo email; segundo `ADMIN` en otro comercio OK,
segundo `ADMIN` en el mismo comercio según regla definida (ver `SAAS_RULES.md` R-ROL-03).

## Etapa 3 — Repositorios y servicios con `comercioId` (aislamiento)

**Objetivo:** ningún dato cruza comercios.
**Toca:** los 7 `src/repositores/*.ts` (firmas con `comercioId`,
`findById → findFirst({ where: { id, comercioId } })`, `count/sumarRecaudacion`
filtrados) y los 7 `src/service/*.ts` (reciben `comercioId` desde `req.auth`,
validación cruzada `producto/categoria/cliente` del mismo comercio,
normalización `email/lower/trim`, corrección del bug `if (!data.stock)` que rechaza
`stock:0` en `producto.service.ts:39-49`, filtro `activo` en `clienteService.getById`).

**Validación:** tests de aislamiento por entidad (nuevo o extendido):
usuario/comercio A pide `GET /productos/:id` de B → `404` (no `403`, no datos);
`POST /ventas` con `productoId` de otro comercio → `404`;
`GET /clientes|/ventas|/movimientos` solo devuelven los propios;
`count/meta.total` no incluye al vecino.

## Etapa 4 — Ventas inmutables + trazabilidad del vendedor

**Objetivo:** cumplir "cada venta registra quién la realizó" y "confirmadas no
modificables libremente".
**Toca:** `src/service/venta.service.ts` (`CrearVentaDTO + vendedorId`,
`iniciarVenta(comercioId, vendedorId, dto)`, máquina de estados `R-VTA-02`,
anulación `COMPLETADA→ANULADA` solo ADMIN con `ENTRADA` compensatoria,
bloqueo de `update` libre y de `delete` físico), `src/controllers/venta.controller.ts`
(pasa `vendedorId` desde token), `src/routes/venta.routes.ts`
(`PUT/DELETE /ventas` restringidos), `src/validators/venta.validation.ts`
(estados permitidos por rol).

**Validación:** `POST /ventas` directa deja `vendedorId = yo`;
`PUT /ventas/:id { estado: COMPLETADA }` como VENDEDOR → `403/409`;
`DELETE /ventas/:id COMPLETADA` → `409` (o `403`); `ANULAR` como ADMIN genera
`Movimiento ENTRADA` y la venta queda `ANULADA` con historia intacta;
`GET /ventas/:id` muestra vendedor.

## Etapa 5 — Stock concurrente

**Objetivo:** sin oversell en ventas concurrentes.
**Toca:** `src/service/movimiento.service.ts` + `venta.service.ts`
(`updateMany` condicional `stock >= cantidad` + `CHECK`),
`PUT/DELETE /movimientos` restringidos.

**Validación:** test de concurrencia (2 ventas simultáneas, stock 1 → una `409`,
stock final ≥ 0). El método de pago solo se registra; no se procesan pagos.

## Etapa 6 — Tests, índices y endurecimiento final

**Objetivo:** cubrir lo que hoy no está cubierto y verificar rendimiento/seguridad.
**Toca:** `src/service/*.test.ts` + nuevos tests
(`categoria/cliente/producto/estadistica` hoy con 0 tests; aislamiento por comercio;
concurrencia; admin-por-comercio; `logout/refresh` con comercio),
revisión de `@@index` con `EXPLAIN` en listados, `morgan`/`helmet`/`limit` finales.

**Validación:** `npm test` 100% en verde incluyendo nuevos suites;
`npm run build` OK; auditoría manual: `rg -n "findUnique|findFirst|findMany" src/repositores`
muestra `comercioId` en toda query tenant; `rg -n "comercioId" src/controllers src/service`
sin lectura de `req.body/query/params` para el scope; checklist `SAAS_RULES.md`
`R-TEN/R-ROL/R-VTA/R-STK/R-PAG/R-SEC/R-DAT` marcado uno por uno.

## Etapa 7 — Corte y datos (fuera de este repo de diseño)

Solo cuando 0–6 estén validadas: backup, `migrate deploy` en staging clonado de prod,
asignación del comercio legado a datos reales, smoke test multiempresa
(A crea, B no ve), y recién entonces ventana de prod. Sin facturación fiscal ni
suscripciones (no-objetivos `R-SCP-02`).

---

## Orden resumido y dependencias

`0 (seguridad, sin schema)` → `1 (schema+migración)` → `2 (auth/scope)` →
`3 (aislamiento repos/servicios)` → `4 (ventas inmutables)` → `5 (stock concurrente)` →
`6 (tests/índices)` → `7 (corte)`. No saltear: 3 depende de 1–2, 4–5 dependen de 3.
