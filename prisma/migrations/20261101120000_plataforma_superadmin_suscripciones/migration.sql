-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('PRUEBA', 'MENSUAL', 'TRIMESTRAL');

-- CreateEnum
CREATE TYPE "MetodoCobro" AS ENUM ('TRANSFERENCIA', 'EFECTIVO', 'OTRO');

-- CreateEnum
CREATE TYPE "AccionPlataforma" AS ENUM ('CREAR_COMERCIO', 'SUSPENDER', 'REACTIVAR', 'EXTENDER_ACCESO', 'CAMBIAR_PLAN', 'REGISTRAR_PAGO');

-- AlterTable
ALTER TABLE "Comercio" ADD COLUMN     "accesoHasta" TIMESTAMP(3),
ADD COLUMN     "motivoSuspension" TEXT,
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'PRUEBA',
ADD COLUMN     "ultimoLogin" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Superadmin" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Superadmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "metodo" "MetodoCobro" NOT NULL,
    "referencia" TEXT,
    "nota" TEXT,
    "plan" "Plan" NOT NULL,
    "mesesAcreditados" INTEGER NOT NULL,
    "accesoDesde" TIMESTAMP(3) NOT NULL,
    "accesoHasta" TIMESTAMP(3) NOT NULL,
    "comercioId" INTEGER NOT NULL,
    "registradoPorId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaPlataforma" (
    "id" SERIAL NOT NULL,
    "accion" "AccionPlataforma" NOT NULL,
    "detalle" JSONB,
    "ip" TEXT,
    "superadminId" INTEGER NOT NULL,
    "comercioId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Superadmin_email_key" ON "Superadmin"("email");

-- CreateIndex
CREATE INDEX "Pago_comercioId_fecha_idx" ON "Pago"("comercioId", "fecha");

-- CreateIndex
CREATE INDEX "AuditoriaPlataforma_comercioId_fecha_idx" ON "AuditoriaPlataforma"("comercioId", "fecha");

-- CreateIndex
CREATE INDEX "AuditoriaPlataforma_superadminId_fecha_idx" ON "AuditoriaPlataforma"("superadminId", "fecha");

-- CreateIndex
CREATE INDEX "Comercio_accesoHasta_idx" ON "Comercio"("accesoHasta");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Superadmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaPlataforma" ADD CONSTRAINT "AuditoriaPlataforma_superadminId_fkey" FOREIGN KEY ("superadminId") REFERENCES "Superadmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaPlataforma" ADD CONSTRAINT "AuditoriaPlataforma_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
