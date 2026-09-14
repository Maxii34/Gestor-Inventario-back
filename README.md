# 📦 Gestor de Inventario

Sistema backend para gestión de inventario, ventas y stock de un comercio, con autenticación por roles y cobros integrados a través de Mercado Pago.

Permite administrar productos, categorías, clientes, movimientos de stock y ventas, con control de acceso diferenciado entre administradores y vendedores, transacciones atómicas para evitar inconsistencias de stock, y un flujo de pago completo mediante Checkout Pro.

---

## 🛠️ Tecnologías

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![Mercado Pago](https://img.shields.io/badge/Mercado%20Pago-00B1EA?style=for-the-badge&logo=mercadopago&logoColor=white)
![bcrypt](https://img.shields.io/badge/bcrypt-338033?style=for-the-badge)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

---

## ✨ Funcionalidades

- **Autenticación y autorización**: login con JWT, refresh token con rotación, roles `ADMIN` y `VENDEDOR` con permisos diferenciados por endpoint.
- **Gestión de catálogo**: CRUD de categorías y productos, con control de precios y stock mínimo.
- **Control de stock**: registro de movimientos (`ENTRADA`, `SALIDA`, `AJUSTE`) con cálculo automático de stock, protegido por transacciones para evitar inconsistencias.
- **Gestión de clientes**: CRUD con soft delete.
- **Ventas**: registro de ventas con múltiples ítems, cálculo automático de totales, y descuento de stock atómico junto con la generación de movimientos.
- **Pagos con Mercado Pago (Checkout Pro)**: la venta queda en estado `PENDIENTE` hasta que Mercado Pago confirma el pago vía webhook; recién ahí se descuenta stock y se completa la venta.
- **Paginación**: en los listados de clientes, productos, movimientos y ventas.
- **Manejo de errores centralizado**: clases de error tipadas (`NotFoundError`, `ConflictError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`) con status HTTP correctos y un único middleware de manejo de errores.
- **Tests automatizados**: cobertura de los flujos de mayor riesgo del negocio (stock, ventas y autenticación) con Vitest.

---

## 📁 Estructura del proyecto

```text
src/

├── config/          # Configuración de Prisma y Mercado Pago
├── controllers/     # Controladores de cada entidad
├── generated/       # Cliente de Prisma generado
├── middlewares/     # Autenticación, validación y manejo de errores
├── repositores/     # Acceso a datos (Prisma)
├── routes/          # Definición de rutas por entidad
├── service/         # Lógica de negocio
├── utils/            # Clases de error y utilidades
├── validators/       # Schemas de validación con Zod
├── app.ts            # Configuración de Express
└── index.ts          # Punto de entrada del servidor

prisma/

├── schema.prisma    # Modelo de datos
└── migrations/      # Historial de migraciones
```

---

## ⚙️ Instalación

1. Cloná el repositorio:

```bash
git clone <url-del-repositorio>
cd gestor-inventario
```

2. Instalá las dependencias:

```bash
npm install
```

3. Creá un archivo `.env` en la raíz con las siguientes variables (ver sección de abajo).

4. Corré las migraciones de Prisma:

```bash
npx prisma migrate dev
```

5. Generá el cliente de Prisma (si no se generó automáticamente):

```bash
npx prisma generate
```

6. Iniciá el servidor en modo desarrollo:

```bash
npm run dev
```

---

## 🔑 Variables de entorno

Creá un archivo `.env` con las siguientes claves (sin exponer los valores reales en ningún commit):

```env
# Servidor
PORT=3001

# Base de datos
DATABASE_URL=

# Autenticación
JWT_SECRET=
JWT_EXPIRES_IN=

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=

# URLs
FRONTEND_URL=
BACKEND_URL=
```

> ⚠️ El archivo `.env` no debe subirse al repositorio. Verificá que esté incluido en `.gitignore`.

---

## 🚀 Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor en modo desarrollo con recarga automática |
| `npm run build` | Compila el proyecto TypeScript a JavaScript |
| `npm start` | Inicia el servidor compilado (producción) |
| `npm test` | Corre la suite de tests una vez |
| `npm run test:watch` | Corre los tests en modo observador (re-ejecuta al guardar cambios) |

---

## 📡 Endpoints principales

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/usuarios/login` | Inicio de sesión | Público |
| POST | `/usuarios/refresh` | Renovación de access token | Público |
| POST | `/usuarios/logout` | Cierre de sesión | Público |
| GET/POST/PUT/DELETE | `/categorias` | Gestión de categorías | ADMIN |
| GET/POST/PUT/DELETE | `/productos` | Gestión de productos | ADMIN (escritura) / Autenticado (lectura) |
| GET/POST/PUT/DELETE | `/clientes` | Gestión de clientes | Autenticado |
| GET/POST/PUT/DELETE | `/movimientos` | Movimientos de stock | Autenticado |
| GET/POST/PUT/DELETE | `/ventas` | Gestión de ventas | Autenticado |
| POST | `/ventas/webhook` | Notificaciones de Mercado Pago | Público (uso exclusivo de Mercado Pago) |

---

## 🧪 Testing

El proyecto incluye tests unitarios con **Vitest**, enfocados en los flujos de negocio con mayor riesgo real (no se busca cobertura total, sino cubrir la lógica que puede fallar silenciosamente):

- **`movimientoService`**: cálculo de stock en `ENTRADA`, `SALIDA` y `AJUSTE`, bloqueo por stock insuficiente, e integridad de la transacción atómica que descuenta stock y registra el movimiento.
- **`ventaService`**: los dos caminos de cobro (inmediato y vía Mercado Pago), y el procesamiento del webhook de pago con sus casos borde (pago aprobado, rechazado, y notificaciones duplicadas).
- **`usuarioService`**: hash y verificación de contraseñas, rotación de refresh tokens, y las reglas de negocio sobre el administrador único del sistema.

Todos los tests usan mocks sobre los repositories y servicios externos (Prisma, Mercado Pago, bcrypt, JWT), por lo que no requieren conexión a una base de datos real para ejecutarse.

Para correrlos:

```bash
npm test
```

---

## 🧩 Modelo de datos

El proyecto utiliza PostgreSQL con Prisma ORM. Las entidades principales son: `Categoria`, `Producto`, `MovimientoStock`, `Cliente`, `Venta`, `DetalleVenta`, `Usuario` y `RefreshToken`.

---

## 👤 Autor

**Maximiliano Exequiel Ordoñez**

---

## 📄 Licencia

Este proyecto está bajo la licencia ISC.