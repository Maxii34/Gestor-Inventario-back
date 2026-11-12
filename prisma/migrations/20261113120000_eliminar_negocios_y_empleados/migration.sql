-- AlterEnum
ALTER TYPE "AccionPlataforma" ADD VALUE 'ELIMINAR_COMERCIO';

-- DropForeignKey
ALTER TABLE "AuditoriaPlataforma" DROP CONSTRAINT "AuditoriaPlataforma_comercioId_fkey";

-- DropForeignKey
ALTER TABLE "Pago" DROP CONSTRAINT "Pago_comercioId_fkey";

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "comercioNombre" TEXT,
ALTER COLUMN "comercioId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "fechaBaja" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaPlataforma" ADD CONSTRAINT "AuditoriaPlataforma_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Pago" SET "comercioNombre" = c."nombre" FROM "Comercio" c WHERE c."id" = "Pago"."comercioId";
