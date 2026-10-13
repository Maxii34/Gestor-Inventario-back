# SAAS_RULES — Reglas de negocio y seguridad (SaaS multiempresa)

> Estado: **diseño / propuesta**. Describe reglas que DEBERÁN cumplir futuras
> modificaciones para convertir el backend monocomercio actual en un SaaS para
> kioscos y almacenes. **No describe comportamiento ya implementado** salvo que
> se indique explícitamente como `Estado actual`.
> Rama de trabajo: `feature/saas-multiempresa`. Documentos hermanos:
> `docs/TECHNICAL_DESIGN.md` (cómo) y `docs/IMPLEMENTATION_PLAN.md` (cuándo).

## 0. Convenciones usadas en este documento

- `Estado actual`: lo que el código hace HOY (verificado en `src/` y `prisma/schema.prisma`).
- `Regla SaaS`: obligación para cualquier cambio futuro. Se marca con `R-XXX`.
- Alcance explícito: **no** incluye facturación fiscal ni suscripciones pagas.

---

## 1. Aislamiento por comercio (tenancy) — reglas duras

- `R-TEN-01` — Todo dato operativo pertenece a un único comercio. Entidades
  alcanzadas: `Categoria, Producto, MovimientoStock, Cliente, Venta, DetalleVenta, Usuario`.
- `R-TEN-02` — Ningún endpoint autenticado puede operar sin `comercioId`
  resuelto desde el token del usuario logueado. El `comercioId` **nunca** se
  acepta desde `body`, `query` o `params` enviados por el cliente.
- `R-TEN-03` — Toda lectura (`findAll`, `findById`, `count`, `aggregate`) y
  toda escritura (`create`, `update`, `delete`) debe filtrar por `comercioId`.
  Un `findById(id)` sin filtro de comercio es un bug de seguridad.
- `R-TEN-04` — Las relaciones entre entidades solo pueden resolverse dentro del
  mismo comercio (ej: una `Venta` no puede referenciar un `Producto` o `Cliente`
  de otro comercio). La validación debe ser explícita en servicio, no solo FK.
- `R-TEN-05` — Los listados y agregados (incluida `GET /estadisticas/recaudacion`)
  solo devuelven datos del comercio del solicitante.
- `R-TEN-06` — Los identificadores públicos de Mercado Pago
  (`mercadoPagoPreferenceId`, `mercadoPagoPaymentId`, `external_reference`) no
  deben permitir enumerar ventas de otros comercios. La resolución webhook debe
  revalidar pertenencia antes de mutar.
- `Estado actual`: hoy **no existe** ningún modelo `Comercio`, ningún campo
  `comercioId` y ningún filtro por comercio. El JWT (`src/service/usuario.service.ts`)
  solo firma `{ id, rol }`. Cualquier usuario autenticado puede leer cualquier registro.

## 2. Asociación usuario ↔ comercio y roles

- `R-ROL-01` — Cada `Usuario` pertenece a exactamente un comercio
  (`Usuario.comercioId` obligatorio). No existen usuarios globales salvo el
  proceso transitorio de alta de comercio (ver `docs/TECHNICAL_DESIGN.md`).
- `R-ROL-02` — Roles iniciales conservados: `ADMIN` y `VENDEDOR`
  (enum `RolUsuario` existente). `ADMIN` administra su comercio
  (usuarios, catálogo, stock, ventas, estadísticas). `VENDEDOR` opera
  venta rápida, clientes, consulta de catálogo/stock.
- `R-ROL-03` — La regla actual "máximo 1 ADMIN en el sistema"
  (`src/service/usuario.service.ts: create/update/delete`) **debe pasar a ser
  "máximo N ADMIN por comercio"** (propuesta: al menos 1, sin límite superior
  global). El alcance global actual rompería el SaaS.
- `R-ROL-04` — Cada venta confirmada debe registrar quién la realizó
  (`Venta.vendedorId → Usuario`, obligatorio para ventas directas y MP).
  `Estado actual`: `Venta` no tiene `usuarioId/vendedorId`; imposible auditar quién vendió.
- `R-ROL-05` — `MovimientoStock` debe registrar quién lo originó cuando lo genera
  un usuario (`responsableId → Usuario`, nullable para movimientos generados por
  webhook/sistema). `Estado actual`: sin trazabilidad.
- `R-ROL-06` — Un usuario desactivado (`activo=false`) o de otro comercio no
  puede autenticarse, refrescar token ni ser atribuido a nuevas ventas.
  El middleware debe revalidar `activo + comercio` además de la firma JWT.

## 3. Ventas: inmutabilidad y estados

Estados vigentes hoy (`prisma/schema.prisma`): `PENDIENTE, COMPLETADA, ANULADA, RECHAZADA`.
Caminos vigentes hoy (`src/service/venta.service.ts`):
`EFECTIVO/TRANSFERENCIA/TARJETA → crearVentaDirecta (COMPLETADA inmediata)`,
`PEDIDO_DISTANCIA → iniciarVentaConMercadoPago (PENDIENTE) + confirmarPago por webhook`.

- `R-VTA-01` — Una venta en `COMPLETADA` es **inmutable**: no admite `PUT` ni
  `DELETE` libre. `Estado actual`: `PUT /ventas/:id` (`src/routes/venta.routes.ts:16`
  + `ventaService.update`) permite cambiar `estado/metodoPago` sin control de
  transición y `DELETE /ventas/:id` borra en duro con cascade a detalles.
- `R-VTA-02` — Transiciones permitidas (propuesta):
  `PENDIENTE → COMPLETADA` (solo webhook MP verificado),
  `PENDIENTE → RECHAZADA` (solo webhook),
  `PENDIENTE → ANULADA` (ADMIN del comercio, antes del cobro),
  `COMPLETADA → ANULADA` (solo ADMIN del comercio, con movimiento compensatorio
  de stock y motivo obligatorio; nunca borrado físico).
  Cualquier otra transición se rechaza con `409`.
- `R-VTA-03` — Anular una venta `COMPLETADA` debe generar movimientos `ENTRADA`
  compensatorios por cada detalle y dejar la venta en `ANULADA` (conserva historia).
  Prohibido `prisma.venta.delete` como operación de negocio.
- `R-VTA-04` — El total de la venta es `sum(subtotales)` calculado en servidor a
  partir de `precioVenta` vigente; el cliente nunca impone totales ni precios.
- `R-VTA-05` — Venta rápida (mostrador, desde compu o celular) = camino directo
  `COMPLETADA` con descuento atómico de stock + movimientos `SALIDA` en la misma
  transacción. Sin pasos intermedios que dejen stock inconsistente.

## 4. Stock y movimientos: consistencia

`Estado actual` (`src/service/movimiento.service.ts: create`):
`ENTRADA: nuevo=anterior+cantidad | SALIDA: nuevo=anterior-cantidad (409 si <0) |
AJUSTE: nuevo=cantidad`, todo en `prisma.$transaction(update producto + create movimiento)`.
`update/delete` de movimientos solo tocan `motivo`/borran fila sin revertir stock.

- `R-STK-01` — Todo cambio de `Producto.stock` ocurre dentro de una transacción
  que persiste el `MovimientoStock` correspondiente (`stockAnterior`, `stockNuevo`).
  Sin excepciones, incluido el camino MP y la anulación.
- `R-STK-02` — Prohibido stock negativo: revalidar dentro de la transacción y
  respaldar con restricción a nivel BD (`CHECK (stock >= 0)` propuesto).
  El chequeo previo fuera de la transacción no basta (condición de carrera).
- `R-STK-03` — `AJUSTE` fija stock con motivo obligatorio y responsable
  registrado; no admite cantidades negativas (ya lo impone `crearMovimientoSchema`
  con `positive()`, debe mantenerse).
- `R-STK-04` — Los movimientos son **historia inmutable**: prohibido `PUT/DELETE`
  de `MovimientoStock` como edición de negocio. `Estado actual`: existen
  `PUT/DELETE /movimientos/:id` sin control de rol que reescriben/borran historia.
  En SaaS deben restringirse a `ADMIN` o eliminarse, y nunca recalcular stock
  hacia atrás sin compensación explícita.
- `R-STK-05` — Ventas concurrentes sobre el mismo producto no pueden hacer
  oversell: usar actualización condicional (`updateMany where { stock >= cantidad }`)
  o bloqueo pesimista + restricción única donde aplique. Los tests actuales
  mockean `$transaction` (`(cb) => cb({})`) y **no prueban atomicidad real**.
- `R-STK-06` — Webhook MP idempotente: doble notificación (secuencial o concurrente)
  del mismo `paymentId` descuenta stock una sola vez. `Estado actual`: solo hay
  guard secuencial `if (estado !== PENDIENTE) return` (`venta.service.ts:200`),
  insuficiente ante concurrencia; `mercadoPagoPaymentId` no es único.

## 5. Pagos con Mercado Pago (sin facturación fiscal)

- `R-MP-01` — La venta MP nace `PENDIENTE` **sin tocar stock**; solo el webhook
  verificado la lleva a `COMPLETADA` (con descuento) o `RECHAZADA` (sin descuento).
- `R-MP-02` — Si falla la creación de la preferencia, no debe quedar una venta
  `PENDIENTE` huérfana: compensar (marcar `ANULADA` con motivo `error_preferencia`)
  o crear la preferencia antes de persistir (decisión en `TECHNICAL_DESIGN.md`).
  `Estado actual`: `iniciarVentaConMercadoPago` crea la venta antes de llamar a MP,
  sin rollback.
- `R-MP-03` — Si el webhook aprueba pero no hay stock, la venta no queda
  `PENDIENTE` para siempre en silencio: definir estado final (`RECHAZADA` o
  `ANULADA` por falta de stock) + alerta al comercio. `Estado actual`: lanza
  `Conflict` dentro del `tx` y la venta queda `PENDIENTE` tras un cobro real.
- `R-MP-04` — El webhook debe verificar firma/secreto de MP, responder `200`
  rápido y procesar en forma idempotente (ver `R-STK-06`). `Estado actual`:
  `POST /ventas/webhook` es público sin verificación (`src/routes/venta.routes.ts:14`).

## 6. Seguridad de API (pre-publicación SaaS)

- `R-SEC-01` — Cerrar `GET /estadisticas/recaudacion`: hoy es la **única ruta sin
  `verificarToken`** (`src/routes/estadistica.routes.ts:7`, importa el middleware
  pero no lo usa). Debe exigir token + pertenencia al comercio.
- `R-SEC-02` — CORS restrictivo: hoy `app.use(cors())` abierto (`src/app.ts:15`).
  Fijar `origin` al frontend real, sin credenciales amplias.
- `R-SEC-03` — Endurecimiento HTTP: `helmet`, `rate-limit` (en especial
  `login/refresh/webhook`), `express.json({ limit })`, `morgan` no-`dev` en prod.
  Hoy ninguno existe (`package.json` verificado).
- `R-SEC-04` — Validar `params/query` con Zod (hoy `validate` solo cubre `body`;
  `Number(req.params.id)` y `page/limit` sin tope permiten `NaN`/DoS).
- `R-SEC-05` — JWT: fail-fast si falta `JWT_SECRET` (hoy `as string` en
  `usuario.service.ts:28` y `auth.middleware.ts:5`), vida corta, y revalidación
  de `activo/comercio` (hoy un desactivado conserva access hasta 1h).
- `R-SEC-06` — Refresh: mantener rotación; evaluar cookie `httpOnly/Secure/SameSite`
  y detección de reuso (hoy viaja en body JSON, reuso solo da `401` sin alarma).
- `R-SEC-07` — Secretos: nunca commitear `.env`, nunca hardcodear `DATABASE_URL`
  (ver riesgo R0 abajo), nunca copiar valores reales a docs. Las variables de
  ejemplo van sin valores (`FRONTEND_URL`, `BACKEND_URL`, `MERCADOPAGO_ACCESS_TOKEN`, etc.).
- `R-SEC-08` — Matriz de permisos por rol (propuesta mínima):
  `Categorías/Productos escritura: ADMIN | lectura: autenticado del comercio.
  Movimientos crear: ADMIN+VENDEDOR | editar/borrar: nadie o ADMIN con auditoría.
  Clientes: crear/editar: ambos roles | borrar (soft): ADMIN.
  Ventas crear: ambos | anular: ADMIN | modificar/eliminar libre: nadie.
  Usuarios: ADMIN. Estadísticas: autenticado del comercio (evaluar solo ADMIN).`
  `Estado actual`: movimientos/clientes/ventas mutables por cualquier `VENDEDOR` logueado.

## 7. Datos, unicidad e índices (tenancy-aware)

- `R-DAT-01` — Toda unicidad "global" actual debe pasar a ser **compuesta por
  comercio**: `Categoria.nombre`, `Cliente.dni/email`, `Usuario.email` pasan a
  `@@unique([comercioId, campo])`. El email puede repetirse entre comercios,
  nunca dentro del mismo.
- `R-DAT-02` — Normalizar unicidades: `trim + lower(email)` y criterio
  case-insensitive para `Categoria.nombre` (hoy `Bebidas ≠ bebidas`).
- `R-DAT-03` — Agregar `@@index` por comercio en FKs y filtros
  (hoy el schema no tiene ningún `@@index`): `Producto(comercioId,categoriaId)`,
  `MovimientoStock(comercioId,productoId,fecha)`, `Venta(comercioId,estado,fecha)`,
  `DetalleVenta(ventaId,productoId)`, `RefreshToken(usuarioId)`.
- `R-DAT-04` — Explicitar `onDelete` en cada relación (hoy solo
  `DetalleVenta→Venta` declara `Cascade`; el resto usa defaults implícitos).
  Regla: `DetalleVenta→Venta: Cascade`, `Venta→Cliente: SetNull`,
  `Producto→Categoria / Movimiento→Producto / Detalle→Producto: Restrict`,
  `RefreshToken→Usuario: Cascade`, `entidades→Comercio: Restrict/Cascade` según diseño.

## 8. Alcance y no-objetivos

- `R-SCP-01` — Uso responsive (compu + celular) es responsabilidad del frontend;
  el backend garantiza paginación (`page/limit` con tope), payloads livianos y
  errores `{ ok:false, mensaje }` estables.
- `R-SCP-02` — **No** implementar facturación fiscal (AFIP/factura electrónica)
  ni planes/suscripciones en esta fase. El schema no debe incluir
  `Plan/Suscripcion/FacturaFiscal`; si se mencionan, solo como "fuera de alcance".
- `R-SCP-03` — No crear datos de demostración entre comercios ni endpoints
  administrativos globales en esta fase.

## 9. Calidad y compatibilidad

- `R-QLT-01` — No romper el formato de error actual `{ ok, mensaje, data?, meta? }`
  ni los códigos (`400/401/403/404/409/500` en `src/utils/errors.ts` +
  `src/middlewares/errorHandler.ts` con `P2002→409, P2025→404`).
- `R-QLT-02` — Cada cambio de servicio con `comercioId` debe acompañarse de tests
  que prueben aislamiento (acceso cruzado → `404`, no `403` con filtración) y los
  casos de concurrencia/idempotencia de `R-STK-05/R-STK-06`.
- `R-QLT-03` — Prohibido modificar BD reales, generar migraciones o commitear
  desde esta fase de diseño. Los cambios de schema viven solo como propuesta en
  `docs/TECHNICAL_DESIGN.md` hasta su etapa correspondiente en
  `docs/IMPLEMENTATION_PLAN.md`.
