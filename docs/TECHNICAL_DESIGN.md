# TECHNICAL_DESIGN — Backend monocomercio → SaaS multiempresa

> Documento de **diseño propuesto**. Nada de lo descrito en §3 en adelante está
> implementado: el código real sigue siendo monocomercio. Referencias al estado
> actual verificadas contra `prisma/schema.prisma` (151 líneas), `src/app.ts`,
> `src/routes/*.ts` (7), `src/controllers/*.ts` (7), `src/service/*.ts` (7 + 3 tests),
> `src/repositores/*.ts` (7), `src/middlewares/*.ts` (3), `src/validators/*.ts` (6).
> Reglas normativas en `../SAAS_RULES.md`. Plan de ejecución en `IMPLEMENTATION_PLAN.md`.
> No contiene secretos ni credenciales.

## 1. Estado actual (verificado, no propuesta)

### 1.1 Arquitectura

```
Cliente (compu/celular, fuera de repo)
  → Express 5 (`src/app.ts`: cors abierto, morgan dev, express.json sin limit)
  → routes (7 grupos) → middlewares verificarToken/esAdmin/validate(body) → controllers (async, sin try/catch)
  → services (lógica) → repositories (Prisma fino, aceptan tx?: TransactionClient) → PostgreSQL vía Prisma 7 + pg adapter
  → errorHandler final (AppError + P2002→409 + P2025→404 + 500 genérico)
```

- Auth: `POST /usuarios/login|refresh|logout` públicos. Access JWT `{ id, rol }`
  1h (`src/service/usuario.service.ts:28-38`), refresh opaco `randomBytes(40)` 7d
  con rotación (`refresh: revocar viejo + emitir par nuevo`). `verificarToken`
  solo verifica firma; `esAdmin` exige `rol==="ADMIN"`.
- Roles: `ADMIN` (gestiona categorías/productos + usuarios) y `VENDEDOR`
  (puede mutar movimientos/clientes/ventas con solo estar logueado).
- Catálogo: `Categoria` (hard delete, `nombre @unique` global),
  `Producto` (regla `precioVenta > precioCompra`, bug `if (!data.stock)` rechaza `stock:0`,
  hard delete, `count()` incluye inactivos).
- Stock: `MovimientoStock{ENTRADA|SALIDA|AJUSTE}` con `stockAnterior/Nuevo`,
  creado en `$transaction` junto al `update` de stock. `PUT/DELETE /movimientos`
  editan/borran historia sin compensar.
- Clientes: soft delete (`activo:false`), pero `findById` sin filtro `activo`.
- Ventas: `iniciarVenta` bifurca por `METODOS_MERCADO_PAGO = ["PEDIDO_DISTANCIA"]`
  (`src/service/venta.service.ts:30`). Directa (`EFECTIVO/TRANSFERENCIA/TARJETA`)
  → `COMPLETADA` inmediata en tx. MP → `PENDIENTE` (creada **antes** de llamar a MP,
  sin tx) + `Preference.create(external_reference=ventaId)` + `confirmarPago`
  por `POST /ventas/webhook` público sin firma, con guard secuencial
  `if (estado !== PENDIENTE) return`. `PUT/DELETE /ventas` libres.
- Estadísticas: `GET /estadisticas/recaudacion?desde&hasta` **sin auth**
  (importa `verificarToken` pero no lo usa), suma `COMPLETADA` en rango.
- Tests: 38 Vitest mockeados (`movimiento 11, venta 12, usuario 15`), `$transaction`
  falseado, sin probar atomicidad/concurrencia/aislamiento. `categoria/cliente/
  producto/estadistica` sin tests.
- Migraciones: 6 (`init` + `activo_cliente` + `usuario` + `refresh_token` +
  `estados_venta_mp` + `metodo_pedido_distancia`). Sin `comercioId` en ninguna tabla.

### 1.2 Esquema actual (resumen)

`Categoria ─1:N─ Producto ─1:N─ MovimientoStock`
`Producto ─1:N─ DetalleVenta ─N:1─ Venta ─N:1─ Cliente (opcional, SET NULL)`
`Usuario ─1:N─ RefreshToken`
Enums: `TipoMovimiento{ENTRADA,SALIDA,AJUSTE}`, `MetodoPago{EFECTIVO,TRANSFERENCIA,TARJETA,PEDIDO_DISTANCIA}`,
`EstadoVenta{PENDIENTE,COMPLETADA,ANULADA,RECHAZADA}`, `RolUsuario{ADMIN,VENDEDOR}`.
Sin `@@index`, con un solo `onDelete(Cascade)` explícito (`Detalle→Venta`).
Sin `Venta.usuarioId`, sin `Movimiento.usuarioId`, sin `Venta.fechaActualizacion`.

---

## 2. Objetivo y decisiones de tenancy

**Objetivo:** cada comercio (kiosco/almacén) opera sus productos, categorías,
stock, ventas, clientes y estadísticas aislado de los demás, desde compu y celular,
con roles `ADMIN/VENDEDOR` por comercio y trazabilidad de quién vendió.

**Decisión: single-database + `comercioId` (row-level tenancy).**
Alternativas descartadas para esta fase:

| Opción | Por qué no |
|---|---|
| BD por comercio | Costo operativo, migraciones N×, sin necesidad de aislamiento físico para kioscos |
| Schema Postgres por comercio | Prisma lo soporta mal, migraciones y connection-pool complejos |
| `comercioId` por fila (elegida) | Una BD, una migración, filtros + constraints compuestos; suficiente para el volumen esperado y compatible con la capa repository actual (ya acepta `tx` y `where`) |

Consecuencia: **todo acceso debe llevar `where: { comercioId }`**; el olvido de un
filtro es filtración. Por eso el diseño exige un helper de scope + tests de
aislamiento por entidad (ver §5 y `IMPLEMENTATION_PLAN.md` etapa 6).

---

## 3. Cambios de esquema PROPUESTOS (no aplicar aún)

> Solo propuesta documental. No modificar `prisma/schema.prisma` ni generar
> migraciones hasta la etapa correspondiente del plan.

### 3.1 Nuevo modelo `Comercio`

```prisma
// PROPUESTO — no existe hoy
model Comercio {
  id          Int      @id @default(autoincrement())
  nombre      String
  slug        String   @unique            // identificador URL/espacio, ej "kiosco-don-pepe"
  activo      Boolean  @default(true)
  categorias  Categoria[]
  productos   Producto[]
  movimientos MovimientoStock[]
  clientes    Cliente[]
  ventas      Venta[]
  usuarios    Usuario[]
  fechaCreacion DateTime @default(now())
  fechaActualizacion DateTime @updatedAt
}
```

- `slug @unique` global: único punto con unicidad global (para alta/resolución).
- Alta de comercio: endpoint transitorio `POST /comercios` (público con captcha/
  rate-limit o protegido por clave de bootstrap) que crea `Comercio + primer ADMIN`.
  Fuera de eso, no hay usuarios sin comercio.

### 3.2 `comercioId` en 7 modelos + trazabilidad de vendedor

```prisma
// PROPUESTO — diff conceptual por modelo (añadidos con "+")
model Categoria {
+ comercioId Int
+ comercio   Comercio @relation(fields: [comercioId], references: [id], onDelete: Restrict)
- nombre String @unique                    // se elimina unicidad global
+ @@unique([comercioId, nombre])            // unicidad por comercio
+ @@index([comercioId])
}

model Producto {
+ comercioId Int
+ comercio   Comercio @relation(fields: [comercioId], references: [id], onDelete: Restrict)
+ @@index([comercioId, categoriaId])
+ @@index([comercioId, nombre])
}

model MovimientoStock {
+ comercioId Int
+ comercio   Comercio @relation(fields: [comercioId], references: [id], onDelete: Restrict)
+ responsableId Int?                       // R-ROL-05: quién lo generó (nullable = sistema/webhook)
+ responsable Usuario? @relation("MovimientoResponsable", fields: [responsableId], references: [id], onDelete: SetNull)
+ @@index([comercioId, productoId, fecha])
}

model Cliente {
+ comercioId Int
+ comercio   Comercio @relation(fields: [comercioId], references: [id], onDelete: Restrict)
- dni String? @unique / email String? @unique
+ @@unique([comercioId, dni])
+ @@unique([comercioId, email])
+ @@index([comercioId])
}

model Venta {
+ comercioId Int
+ comercio   Comercio @relation(fields: [comercioId], references: [id], onDelete: Restrict)
+ vendedorId Int                            // R-ROL-04: obligatorio
+ vendedor   Usuario  @relation("VentaVendedor", fields: [vendedorId], references: [id], onDelete: Restrict)
+ fechaActualizacion DateTime @updatedAt    // audita PENDIENTE→COMPLETADA
  mercadoPagoPreferenceId String?           // + @@unique donde aplique (ver §3.4)
  mercadoPagoPaymentId    String?           // + @@unique propuesto
+ @@index([comercioId, estado, fecha])
+ @@index([comercioId, clienteId])
}

model Usuario {
+ comercioId Int
+ comercio   Comercio @relation(fields: [comercioId], references: [id], onDelete: Restrict)
- email String @unique
+ @@unique([comercioId, email])             // mismo email válido en 2 comercios distintos
+ @@index([comercioId, rol])
}

model RefreshToken {
  // sin comercioId directo: se resuelve vía Usuario.comercioId.
  // onDelete propuesto: Cascade (hoy RESTRICT implícito obliga a borrar a mano).
+ @@index([usuarioId])
}
```

Relaciones `Usuario` inversas a añadir (propuesto):
`ventasRealizadas Venta[] @relation("VentaVendedor")`,
`movimientosGenerados MovimientoStock[] @relation("MovimientoResponsable")`.

### 3.3 Regla de unicidad y normalización

- `Categoria[comercioId,nombre]`, `Cliente[comercioId,dni]`, `Cliente[comercioId,email]`,
  `Usuario[comercioId,email]`: migrar de `@unique` global a `@@unique` compuesto.
  Requiere migración de datos: antes del `ADD comercioId NOT NULL`, crear comercio
  inicial ("comercio legado") y backfillear todas las filas existentes a él; luego
  aplicar constraints. Sin backfill, la migración falla o deja huérfanos.
- Normalización en servicio (no solo BD): `email.trim().toLowerCase()`,
  `nombre.trim()` + comparación case-insensitive para categorías.

### 3.4 Idempotencia y concurrencia (stock + MP)

1. **Stock sin oversell (propuesto):** mantener `$transaction` actual y añadir
   dentro del `tx` actualización condicional:
   `productoRepository.updateMany({ where: { id, comercioId, stock: { gte: cantidad } }, data: { stock: { decrement: cantidad } } })`.
   Si `count===0` → `ConflictError("Stock insuficiente")`. Añadir
   `CHECK (stock >= 0)` en migración. El `findById` previo queda como validación
   de UX, no como garantía.
2. **Webhook idempotente (propuesto):** `mercadoPagoPaymentId @unique` +
   transición condicional `updateMany({ where: { id, comercioId, estado: PENDIENTE }, data: { estado: COMPLETADA, ... } })`.
   Si `count===0`, otro worker ya la procesó → retornar sin tocar stock.
   Alternativa si el proveedor no garantiza `paymentId` estable: tabla
   `WebhookEvent{ provider, eventId @unique, ventaId, estado }` y `upsert` primero.
3. **Creación MP sin huérfanas (propuesto, 2 opciones):**
   - A (recomendada): crear `Preference` **antes** de persistir la venta cuando sea
     posible, o envolver `create venta + create preferencia + update preferenceId`
     con compensación: `catch → update venta { estado: ANULADA, motivo }`.
   - B: job de limpieza que anula `PENDIENTE` sin `preferenceId` tras N minutos.
4. **Admin único por comercio (propuesto):** reemplazar
   `findByRol("ADMIN")` global por `count({ where: { comercioId, rol: ADMIN, activo: true } })`
   y, para cerrar TOCTOU, apoyo en `@@unique` parcial o transacción serializable en
   `create/update` a ADMIN (documentar que dos altas concurrentes hoy pasarían el check).

### 3.5 Diagrama propuesto (textual)

```
Comercio 1---N Categoria 1---N Producto 1---N MovimientoStock
   |              |                |
   |              |                +---N DetalleVenta N---1 Venta N---1 Cliente
   |              +---N Producto ---+
   +---N Cliente ---N Venta (vendedorId → Usuario)
   +---N Usuario 1---N RefreshToken
   +---N MovimientoStock (responsableId → Usuario, nullable)
Venta.comercioId = Producto.comercioId = Cliente.comercioId (validado en servicio)
```

---

## 4. Cómo asociar usuarios y entidades con un comercio

1. **Alta:** `POST /comercios { nombre, slug, adminNombre, adminEmail, adminPassword }`
   → tx crea `Comercio + Usuario(ADMIN, comercioId)` → devuelve tokens con
   `comercioId`. Es el único flujo que crea un usuario sin token previo.
2. **Login/refresh:** `findByEmail` pasa a `findFirst({ where: { emailNormalizado, comercio: { slug } } })`
   o `findFirst({ where: { email, comercioId } })` según si el login pide comercio.
   JWT pasa de `{ id, rol }` a **`{ id, rol, comercioId }`**. `generarRefreshToken`
   sin cambios de formato; la pertenencia se revalida vía `Usuario.comercioId`.
3. **Request scope:** `verificarToken` inyecta `req.auth = { usuarioId, rol, comercioId }`
   y además revalida `Usuario{ activo, comercioId }` (cierra sesión de desactivados).
   Nuevo helper `requireComercio(req): number` que lanza `401` si falta.
4. **Servicios:** cada método recibe `comercioId` (desde `req.auth`, nunca del body):
   `productoService.getAll(comercioId, page, limit)`,
   `ventaService.iniciarVenta(comercioId, vendedorId, dto)`, etc.
5. **Repositorios:** cada query añade `comercioId`:
   `findAll(comercioId, skip, take) → findMany({ where: { comercioId, ...filtros } })`,
   `findById(id, comercioId) → findFirst({ where: { id, comercioId } })`,
   `count(comercioId)`, `sumarRecaudacion(comercioId, desde, hasta)`.
   Devolver `null` ante id de otro comercio (→ `404`, no `403`, para no confirmar existencia).

## 5. Cómo aislar datos por comercio (capas)

| Capa | Cambio propuesto |
|---|---|
| `middlewares/auth.middleware.ts` | JWT con `comercioId`; `verificarToken` revalida `activo+comercio`; exporta `AuthRequest { auth: { usuarioId, rol, comercioId } }`. Mantener `esAdmin` (ahora "admin del comercio"). |
| `middlewares/validate.ts` | Extender a `body/params/query` con Zod; tope `limit<=50`;diffiere formato `{ ok:false, mensaje }` actual. |
| `controllers/*` | Extraen `comercioId/vendedorId` de `req.auth` y los pasan a servicios. `ventaController.create` pasa `vendedorId`. `webhook` verifica firma antes de llamar al servicio. |
| `service/*` | Validación cruzada: `producto.categoria.comercioId === comercioId`, `cliente.comercioId === comercioId`, `detalle.producto.comercioId === comercioId`. Regla admin-por-comercio. Máquina de estados de venta (`R-VTA-02`). |
| `repositores/*` | Firma con `comercioId` obligatorio en entidades tenant. Sin método "global" salvo alta de comercio. |
| `routes/*` | `GET /estadisticas/recaudacion` pasa a `verificarToken`; `PUT/DELETE /ventas` y `PUT/DELETE /movimientos` se restringen según `R-SEC-08/R-VTA-01/R-STK-04`. |
| `validators/*` | Sin `comercioId` en schemas de cliente (viene del token). Añadir schemas de `params/query` (`id`, `page/limit`, `desde/hasta`). |

## 6. Riesgos y deuda pre-SaaS (deben resolverse antes de publicar)

Ordenados por severidad; referencias al código real:

1. **Secreto commiteado en `Dockerfile:16`** — `DATABASE_URL` de Neon con usuario/
   password en claro en la imagen. Rotar credencial, sacarlo del Dockerfile,
   usar `--secret`/build-arg o solo runtime `env_file`. (No se reproduce el valor aquí.)
2. **`GET /estadisticas/recaudacion` pública** (`estadistica.routes.ts:7`) — expone
   recaudación. Cerrar con auth antes de cualquier deploy SaaS.
3. **Webhook MP sin firma** (`venta.routes.ts:14`, `venta.controller.ts:39-47`) —
   permite oráculo de `paymentId` y reintentos maliciosos. Exigir verificación HMAC.
4. **`PUT/DELETE /ventas` libres** (`venta.service.ts:253-276`) — permiten completar/
   borrar ventas confirmadas y descuadrar stock/estadísticas. Bloquear según `R-VTA-01`.
5. **Condición de carrera de stock** (`venta.service.ts:104-145,186-238`,
   `movimiento.service.ts:41-78`) — `find` fuera/dentro sin lock + tests con
   `$transaction` mockeado. Implementar §3.4 + `CHECK`.
6. **Venta MP huérfana / PENDIENTE eterna** (`venta.service.ts:152-184,204-250`) —
   sin compensación ante fallo de preferencia ni ante falta de stock post-cobro.
7. **CORS abierto + sin helmet/rate-limit** (`app.ts:15`, `package.json`) —
   fijar origin, límites y throttling en `login/refresh/webhook`.
8. **`JWT_SECRET as string` sin fail-fast + sin revalidación de `activo`** —
   arranque inseguro y sesiones de desactivados válidas 1h.
9. **Unicidades globales + sin índices** — bloquean multiempresa y degradan
   rendimiento; migrar a `@@unique/@@index` compuestos (§3.2–3.3).
10. **Falta trazabilidad `vendedorId/responsableId`** — sin ella no se cumple
    "cada venta registra quién la realizó" ni se auditan ajustes.

## 7. Lo que NO cambia en esta fase

- Formato de respuesta `{ ok, mensaje, data, meta }` y códigos de `utils/errors.ts`.
- Enums `TipoMovimiento/MetodoPago/EstadoVenta/RolUsuario` (solo cambia el alcance
  de la regla admin, no el enum).
- Flujo MP de dos caminos (directo vs `PEDIDO_DISTANCIA`); no se agregan métodos.
- Sin `Plan/Suscripcion/FacturaFiscal`, sin panel super-admin global, sin seeds
  cruzados entre comercios.
