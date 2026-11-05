-- SaaS multiempresa: tabla Comercio, comercioId en entidades tenant,
-- trazabilidad de vendedor/responsable/anulación, unicidades e índices
-- compuestos por comercio, FKs compuestas anti-filtración y CHECK de stock.
--
-- Backfill seguro: crea el comercio legado (id=1) y asigna comercioId con
-- DEFAULT temporal para filas existentes; luego se quita el DEFAULT.
-- En bases vacías el INSERT solo ocupa el id 1 (se ajusta la secuencia).

-- CreateTable
CREATE TABLE "Comercio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comercio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comercio_slug_key" ON "Comercio"("slug");

-- Comercio legado para registros existentes
INSERT INTO "Comercio" ("id", "nombre", "slug", "activo", "fechaCreacion", "fechaActualizacion")
VALUES (1, 'Comercio inicial', 'legado', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable: comercioId con DEFAULT temporal (cubre filas existentes)
ALTER TABLE "Categoria" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Producto" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MovimientoStock" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Cliente" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Venta" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Usuario" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DetalleVenta" ADD COLUMN     "comercioId" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Categoria" ALTER COLUMN "comercioId" DROP DEFAULT;
ALTER TABLE "Producto" ALTER COLUMN "comercioId" DROP DEFAULT;
ALTER TABLE "MovimientoStock" ALTER COLUMN "comercioId" DROP DEFAULT;
ALTER TABLE "Cliente" ALTER COLUMN "comercioId" DROP DEFAULT;
ALTER TABLE "Venta" ALTER COLUMN "comercioId" DROP DEFAULT;
ALTER TABLE "Usuario" ALTER COLUMN "comercioId" DROP DEFAULT;
ALTER TABLE "DetalleVenta" ALTER COLUMN "comercioId" DROP DEFAULT;

-- AlterTable: trazabilidad y auditoría
ALTER TABLE "MovimientoStock" ADD COLUMN     "responsableId" INTEGER;
ALTER TABLE "Venta" ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "fechaAnulacion" TIMESTAMP(3),
ADD COLUMN     "vendedorId" INTEGER,
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Venta" ALTER COLUMN "fechaActualizacion" DROP DEFAULT;

-- Targets de las FKs compuestas: deben existir antes de crear las FKs
CREATE UNIQUE INDEX "Categoria_id_comercioId_key" ON "Categoria"("id", "comercioId");
CREATE UNIQUE INDEX "Producto_id_comercioId_key" ON "Producto"("id", "comercioId");
CREATE UNIQUE INDEX "Cliente_id_comercioId_key" ON "Cliente"("id", "comercioId");
CREATE UNIQUE INDEX "Usuario_id_comercioId_key" ON "Usuario"("id", "comercioId");
CREATE UNIQUE INDEX "Venta_id_comercioId_key" ON "Venta"("id", "comercioId");

-- AddForeignKey: entidades -> Comercio
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: reemplazar FKs simples por compuestas (mismo comercio)
ALTER TABLE "Producto" DROP CONSTRAINT "Producto_categoriaId_fkey";
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_comercioId_fkey" FOREIGN KEY ("categoriaId", "comercioId") REFERENCES "Categoria"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoStock" DROP CONSTRAINT "MovimientoStock_productoId_fkey";
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_productoId_comercioId_fkey" FOREIGN KEY ("productoId", "comercioId") REFERENCES "Producto"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Venta" DROP CONSTRAINT "Venta_clienteId_fkey";
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_comercioId_fkey" FOREIGN KEY ("clienteId", "comercioId") REFERENCES "Cliente"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DetalleVenta" DROP CONSTRAINT "DetalleVenta_ventaId_fkey";
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_ventaId_comercioId_fkey" FOREIGN KEY ("ventaId", "comercioId") REFERENCES "Venta"("id", "comercioId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DetalleVenta" DROP CONSTRAINT "DetalleVenta_productoId_fkey";
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_productoId_comercioId_fkey" FOREIGN KEY ("productoId", "comercioId") REFERENCES "Producto"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_usuarioId_fkey";
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Venta" ADD CONSTRAINT "Venta_vendedorId_comercioId_fkey" FOREIGN KEY ("vendedorId", "comercioId") REFERENCES "Usuario"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_anuladoPorId_comercioId_fkey" FOREIGN KEY ("anuladoPorId", "comercioId") REFERENCES "Usuario"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_responsableId_comercioId_fkey" FOREIGN KEY ("responsableId", "comercioId") REFERENCES "Usuario"("id", "comercioId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quitar unicidades globales
DROP INDEX "Categoria_nombre_key";
DROP INDEX "Cliente_dni_key";
DROP INDEX "Cliente_email_key";
DROP INDEX "Usuario_email_key";

-- Unicidades compuestas por comercio
CREATE UNIQUE INDEX "Categoria_comercioId_nombre_key" ON "Categoria"("comercioId", "nombre");
CREATE UNIQUE INDEX "Cliente_comercioId_dni_key" ON "Cliente"("comercioId", "dni");
CREATE UNIQUE INDEX "Cliente_comercioId_email_key" ON "Cliente"("comercioId", "email");
CREATE UNIQUE INDEX "Usuario_comercioId_email_key" ON "Usuario"("comercioId", "email");
CREATE UNIQUE INDEX "Venta_mercadoPagoPaymentId_key" ON "Venta"("mercadoPagoPaymentId");

-- Índices por comercio
CREATE INDEX "Categoria_comercioId_idx" ON "Categoria"("comercioId");
CREATE INDEX "Producto_comercioId_categoriaId_idx" ON "Producto"("comercioId", "categoriaId");
CREATE INDEX "Producto_comercioId_nombre_idx" ON "Producto"("comercioId", "nombre");
CREATE INDEX "MovimientoStock_comercioId_productoId_fecha_idx" ON "MovimientoStock"("comercioId", "productoId", "fecha");
CREATE INDEX "Cliente_comercioId_idx" ON "Cliente"("comercioId");
CREATE INDEX "Venta_comercioId_estado_fecha_idx" ON "Venta"("comercioId", "estado", "fecha");
CREATE INDEX "Venta_comercioId_clienteId_idx" ON "Venta"("comercioId", "clienteId");
CREATE INDEX "DetalleVenta_ventaId_productoId_idx" ON "DetalleVenta"("ventaId", "productoId");
CREATE INDEX "Usuario_comercioId_rol_idx" ON "Usuario"("comercioId", "rol");
CREATE INDEX "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");

-- CHECK: impedir stock negativo (no expresable en el schema Prisma)
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_stock_no_negativo" CHECK ("stock" >= 0);

-- Ajustar secuencia de Comercio por el INSERT con id explícito
SELECT setval('"Comercio_id_seq"', (SELECT MAX("id") FROM "Comercio"));
