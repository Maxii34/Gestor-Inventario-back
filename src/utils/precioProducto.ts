import { Prisma } from "../generated/prisma/client";
import { BadRequestError } from "./errors";

export const DECIMALES_COSTO_UNIDAD = 4;

export const calcularPrecioCompraPorUnidad = (
  precioCompraPaquete: ConstructorParameters<typeof Prisma.Decimal>[0],
  unidadesPorPaquete: number,
): Prisma.Decimal =>
  new Prisma.Decimal(precioCompraPaquete)
    .div(unidadesPorPaquete)
    .toDecimalPlaces(DECIMALES_COSTO_UNIDAD, Prisma.Decimal.ROUND_HALF_UP);

export const resolverPreciosProducto = (data: {
  precioCompra?: number;
  precioCompraPaquete?: number | null;
  unidadesPorPaquete?: number;
}) => {
  const tienePrecioUnidad = data.precioCompra !== undefined;
  const tienePrecioPaquete =
    data.precioCompraPaquete !== undefined && data.precioCompraPaquete !== null;

  if (tienePrecioUnidad && tienePrecioPaquete) {
    throw new BadRequestError(
      "Enviá el costo por unidad o el costo del paquete, no ambos",
    );
  }
  if (!tienePrecioUnidad && !tienePrecioPaquete) {
    throw new BadRequestError("Enviá el costo por unidad o el costo del paquete");
  }

  const unidadesPorPaquete = data.unidadesPorPaquete ?? 1;
  const precioCompra = tienePrecioPaquete
    ? calcularPrecioCompraPorUnidad(
        data.precioCompraPaquete!,
        unidadesPorPaquete,
      )
    : new Prisma.Decimal(data.precioCompra!);

  return {
    precioCompra,
    precioCompraPaquete: tienePrecioPaquete
      ? new Prisma.Decimal(data.precioCompraPaquete!)
      : null,
    unidadesPorPaquete,
  };
};
