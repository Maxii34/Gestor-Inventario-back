# 📦 StockNext: Gestor de inventarios

Backend para gestión de inventario, ventas, stock, suscripciones y administración multiempresa de comercios. El sistema está orientado a operar como plataforma SaaS donde cada comercio tiene su propio catálogo, usuarios, ventas y datos aislados, además de un panel de administración global para soporte y gestión de la plataforma.

El proyecto combina Express + TypeScript + Prisma + PostgreSQL y soporta autenticación por JWT, control de roles, vigencia de planes, reactivación/suspensión de comercios, carga masiva de productos/categorías, auditoría y administración por superadmin.

---

## 🛠️ Stack tecnológico

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![bcrypt](https://img.shields.io/badge/bcrypt-338033?style=for-the-badge)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

---

## ✨ Funcionalidades actuales

### 1) SaaS multiempresa

- Registro público de comercios con creación automática del primer administrador.
- Aislamiento por `comercioId` en todas las entidades relevantes.
- Soporte de planes: `PRUEBA`, `MENSUAL`, `TRIMESTRAL`.
- Control de vigencia y acceso por comercio.
- Suspensión/reactivación de comercios por parte del superadmin.
- Extensión de acceso y registro de pagos asociados.
- Matrices de auditoría con acciones de plataforma.

### 2) Autenticación y roles

- Login con JWT y refresh token.
- Usuarios con roles `ADMIN` y `VENDEDOR`.
- Validación por comercio: cada request se valida contra el `comercioId` del token.
- Usuarios deshabilitados quedan bloqueados.
- Middleware de vigencia para evitar acceso cuando la suscripción venció o está suspendida.
- Login y refresh con rate limiting para protección de fuerza bruta.

### 3) Gestión de catálogo y proveedores

- CRUD de categorías, productos y proveedores.
- Productos con precio de compra, precio de venta, stock mínimo, código de barras y activos/inactivos.
- Soporte de productos por paquete (`precioCompraPaquete`, `unidadesPorPaquete`).
- Validación de integridad de datos por comercio.
- Carga masiva de categorías y productos por parte del superadmin.

### 4) Stock y movimientos

- Registro de movimientos de stock (`ENTRADA`, `SALIDA`, `AJUSTE`).
- Actualización automática de stock con validaciones de integridad.
- Transacciones atómicas para evitar inconsistencias.
- Trazabilidad con `responsableId` y `stockAnterior` / `stockNuevo`.
- Control de stock insuficiente en ventas y movimientos.

### 5) Ventas y clientes

- CRUD de clientes con datos por comercio.
- Registro de ventas con múltiples detalles.
- Cálculo automático de total y subtotales.
- Método de pago registrado por venta (`EFECTIVO`, `TRANSFERENCIA`, `TARJETA`).
- Estado de venta: `PENDIENTE`, `COMPLETADA`, `ANULADA`, `RECHAZADA`.
- Trazabilidad de vendedor y de quién anuló la venta.
- Soporte a anulación y reintegro de stock con movimiento compensatorio.

### 6) Plataforma administrativa (superadmin)

- Login exclusivo del superadmin.
- Listado paginado de comercios, métricas y auditoría.
- Crear comercios desde la plataforma.
- Gestionar usuarios de cada comercio.
- Resetear contraseña de usuarios del comercio.
- Suspender/reactivar comercios con motivo.
- Extender vigencia del acceso.
- Cambiar plan del comercio.
- Registrar pagos y consultar historial.
- Cargas masivas de datos para cada comercio.

### 7) Seguridad y robustez

- `helmet` para cabeceras seguras.
- `cors` configurable por ambiente.
- `express-rate-limit` para protección general y endpoints sensibles.
- `morgan` para logs en desarrollo.
- Validación centralizada con Zod.
- Manejo centralizado de errores con clases tipadas.
- Estructura diseñada para aislamiento de tenant por `comercioId`.

---

## 📁 Estructura del proyecto

```text
.
├── Dockerfile
├── docker-compose.yml
├── docker-compose.test.yml
├── package.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── TECHNICAL_DESIGN.md
├── public/
├── scripts/
│   └── crear-superadmin.ts
├── src/
│   ├── app.ts
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   ├── errors/
│   ├── generated/
│   ├── middlewares/
│   ├── repositorios/
│   ├── routes/
│   ├── service/
│   ├── types/
│   ├── utils/
│   ├── validators/
│   ├── aislamiento.integration.test.ts
│   ├── plataforma-usuarios-carga.integration.test.ts
│   ├── plataforma.integration.test.ts
│   └── vigencia.integration.test.ts
├── README.md
├── SAAS_RULES.md
└── tsconfig.json
```

---

## ⚙️ Instalación y configuración

1. Cloná el repositorio:

```bash
git clone <url-del-repositorio>
cd stocknext
```

2. Instalá las dependencias:

```bash
npm install
```

3. Creá un archivo `.env` en la raíz con las variables necesarias:

```env
# Servidor
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000

# Base de datos
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gestor_inventario

# Auth
JWT_SECRET=tu_jwt_secret_muy_seguro
JWT_EXPIRES_IN=1h

# Config adicional
REGISTRO_PUBLICO=true
VIGENCIA_CACHE_SEGUNDOS=15
```

> El archivo `.env` no debe subirse al repositorio. Asegurate de que esté incluido en `.gitignore`.

4. Ejecutá las migraciones de Prisma:

```bash
npx prisma migrate dev
```

5. Generá el cliente Prisma:

```bash
npx prisma generate
```

6. Iniciá la API:

```bash
npm run dev
```

### Docker

También podés levantar la app con Docker Compose:

```bash
docker compose up --build
```

Para la base de pruebas:

```bash
docker compose -f docker-compose.test.yml up -d
```

---

## 🚀 Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor en modo desarrollo con recarga automática |
| `npm run build` | Compila TypeScript a JavaScript |
| `npm start` | Ejecuta la build de producción |
| `npm test` | Corre la suite de tests |
| `npm run test:watch` | Ejecuta los tests en modo observador |
| `npm run test:integration` | Levanta DB de test y ejecuta tests de integración |
| `npm run db:test:up` | Levanta la base de pruebas con Docker |
| `npm run db:test:down` | Cierra la base de pruebas |
| `npm run superadmin:crear` | Crea un superadmin inicial |

---

## 📡 Endpoints principales

### Rutas públicas

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/comercios/registrar` | Registro público de un nuevo comercio y su primer admin |
| POST | `/plataforma/login` | Login del superadmin de la plataforma |
| POST | `/usuarios/login` | Login de un usuario del comercio |
| POST | `/usuarios/refresh` | Renovación del token |
| POST | `/usuarios/logout` | Cierre de sesión |

### Rutas autenticadas por comercio

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PUT/DELETE | `/categorias` | Gestión del catálogo de categorías |
| GET/POST/PUT/DELETE | `/productos` | Gestión de productos |
| GET/POST/PUT/DELETE | `/proveedores` | Gestión de proveedores |
| GET/POST/PUT/DELETE | `/clientes` | Gestión de clientes |
| GET/POST/PUT/DELETE | `/movimientos` | Registro y consulta de movimientos de stock |
| GET/POST/PUT/DELETE | `/ventas` | Gestión de ventas |
| GET/POST/PUT/DELETE | `/usuarios` | Administración de usuarios del comercio |
| GET | `/estadisticas` | Consulta de métricas del negocio |
| GET | `/suscripcion` | Estado actual de la suscripción y vigencia |

### Rutas de administración de plataforma

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/plataforma/comercios` | Listado de comercios |
| POST | `/plataforma/comercios` | Crear comercio desde plataforma |
| GET | `/plataforma/comercios/:id` | Detalle de comercio |
| GET | `/plataforma/comercios/:id/usuarios` | Usuarios del comercio |
| PUT | `/plataforma/comercios/:id/usuarios/:usuarioId` | Editar usuario |
| POST | `/plataforma/comercios/:id/usuarios/:usuarioId/resetear-password` | Resetear contraseña |
| POST | `/plataforma/comercios/:id/categorias/masivo` | Carga masiva de categorías |
| POST | `/plataforma/comercios/:id/productos/masivo` | Carga masiva de productos |
| POST | `/plataforma/comercios/:id/suspender` | Suspender comercio |
| POST | `/plataforma/comercios/:id/reactivar` | Reactivar comercio |
| POST | `/plataforma/comercios/:id/extender` | Extender acceso |
| POST | `/plataforma/comercios/:id/cambiar-plan` | Cambiar plan |
| POST | `/plataforma/comercios/:id/pagos` | Registrar pago |
| GET | `/plataforma/comercios/:id/pagos` | Historial de pagos |
| GET | `/plataforma/auditoria` | Auditoría de la plataforma |
| GET | `/plataforma/metricas` | Métricas globales |

---

## 🧩 Modelo de datos principal

El proyecto usa PostgreSQL con Prisma ORM y principales entidades como:

- `Comercio`
- `Categoria`
- `Producto`
- `Proveedor`
- `MovimientoStock`
- `Cliente`
- `Venta`
- `DetalleVenta`
- `Usuario`
- `RefreshToken`
- `Superadmin`
- `Pago`
- `AuditoriaPlataforma`

Incluye enums como:

- `Plan`: `PRUEBA`, `MENSUAL`, `TRIMESTRAL`
- `RolUsuario`: `ADMIN`, `VENDEDOR`
- `MetodoPago`: `EFECTIVO`, `TRANSFERENCIA`, `TARJETA`
- `EstadoVenta`: `PENDIENTE`, `COMPLETADA`, `ANULADA`, `RECHAZADA`
- `TipoMovimiento`: `ENTRADA`, `SALIDA`, `AJUSTE`

---

## 🧪 Testing

El proyecto cuenta con una suite de tests con Vitest para validar los flujos críticos del dominio:

- stock y movimientos
- ventas y anulaciones
- usuarios y auth
- aislamiento por comercio
- vigencia de acceso
- carga masiva y administración de plataforma

Para ejecutar todos los tests:

```bash
npm test
```

Para integración con base de pruebas:

```bash
npm run test:integration
```

---

## 📝 Observaciones importantes

- El sistema no procesa pagos reales; solo registra el método de cobro y la información del pago administrativo.
- Cada comercio está aislado de los demás por `comercioId` en relaciones, filtros y validaciones.
- La vigencia del acceso se usa para controlar si un comercio sigue activo o quedó en modo solo lectura.
- La plataforma de superadmin implementa la parte operativa del SaaS, sin incluir facturación fiscal ni subscripciones complejas fuera del alcance del backend.

---

## 👤 Autor

**Maximiliano Exequiel Ordoñez**

---

## 📄 Licencia

Este proyecto está bajo la licencia ISC.