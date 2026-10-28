-- AlterEnum
BEGIN;
CREATE TYPE "MetodoPago_new" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA');
ALTER TABLE "Venta" ALTER COLUMN "metodoPago" TYPE "MetodoPago_new" USING ("metodoPago"::text::"MetodoPago_new");
ALTER TYPE "MetodoPago" RENAME TO "MetodoPago_old";
ALTER TYPE "MetodoPago_new" RENAME TO "MetodoPago";
DROP TYPE "public"."MetodoPago_old";
COMMIT;

-- DropIndex
DROP INDEX "Venta_mercadoPagoPaymentId_key";

-- AlterTable
ALTER TABLE "Venta" DROP COLUMN "mercadoPagoPaymentId",
DROP COLUMN "mercadoPagoPreferenceId";
