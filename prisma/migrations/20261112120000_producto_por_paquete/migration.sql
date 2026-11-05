-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "precioCompraPaquete" DECIMAL(12,2),
ADD COLUMN     "unidadesPorPaquete" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "precioCompra" SET DATA TYPE DECIMAL(12,4);
