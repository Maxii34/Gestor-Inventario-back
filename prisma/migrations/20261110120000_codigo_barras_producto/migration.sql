ALTER TABLE "Producto" ADD COLUMN "codigoBarras" TEXT;
CREATE UNIQUE INDEX "Producto_comercioId_codigoBarras_key" ON "Producto"("comercioId", "codigoBarras");
