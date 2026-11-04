import { productoRepository } from "../repositores/producto.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { Prisma } from "../generated/prisma/client";
import {
  calcularPrecioCompraPorUnidad,
  resolverPreciosProducto,
} from "../utils/precioProducto";
import { NotFoundError, BadRequestError, ConflictError } from "../utils/errors";

interface CrearProductoDTO {
  nombre: string;
  descripcion?: string;
  codigoBarras?: string | null;
  precioCompra?: number;
  precioCompraPaquete?: number | null;
  unidadesPorPaquete?: number;
  precioVenta: number;
  stock?: number;
  stockMinimo?: number;
  categoriaId: number;
}

type ActualizarProductoDTO = Partial<CrearProductoDTO>;

export const productoService = {
  getAll: async (comercioId: number, page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [productos, total] = await Promise.all([
      productoRepository.findAll(comercioId, skip, limit),
      productoRepository.count(comercioId),
    ]);

    return {
      data: productos,
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  },

  getById: async (id: number, comercioId: number) => {
    const producto = await productoRepository.findById(id, comercioId);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }
    return producto;
  },

  getByCodigoBarras: async (codigoBarras: string, comercioId: number) => {
    const producto = await productoRepository.findByCodigoBarras(
      comercioId,
      codigoBarras,
    );
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }
    return producto;
  },

  create: async (data: CrearProductoDTO, comercioId: number) => {
    if (!data.nombre || !data.precioVenta || data.stock === undefined) {
      throw new BadRequestError(
        "Nombre, precio de venta y stock son obligatorios",
      );
    }

    // Resuelve el costo por unidad a partir del precio de la caja o del costo
    // unitario enviado. Se hace con Decimal para no arrastrar errores de float
    // al guardar 4 decimales.
    const precios = resolverPreciosProducto(data);
    if (!new Prisma.Decimal(data.precioVenta).gt(precios.precioCompra)) {
      throw new BadRequestError(
        "El precio de venta debe ser mayor al de compra",
      );
    }

    // La categoría debe existir Y pertenecer al mismo comercio: si es de otro
    // comercio (o no existe) se responde 404 sin confirmar cuál es el caso.
    const categoria = await categoriaRepository.findById(
      data.categoriaId,
      comercioId,
    );
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada");
    }

    if (data.codigoBarras) {
      const existente = await productoRepository.findByCodigoBarras(
        comercioId,
        data.codigoBarras,
      );
      if (existente) {
        throw new ConflictError("Ya existe un producto con ese código de barras");
      }
    }

    const { categoriaId, ...resto } = data;

    return productoRepository.create({
      ...resto,
      precioCompra: precios.precioCompra,
      precioCompraPaquete: precios.precioCompraPaquete,
      unidadesPorPaquete: precios.unidadesPorPaquete,
      activo: true,
      comercio: { connect: { id: comercioId } },
      categoria: { connect: { id: categoriaId } },
    });
  },

  update: async (
    id: number,
    comercioId: number,
    data: ActualizarProductoDTO,
  ) => {
    const productoExistente = await productoRepository.findById(id, comercioId);
    if (!productoExistente) {
      throw new NotFoundError("El producto no existe");
    }

    if (data.categoriaId !== undefined) {
      const categoria = await categoriaRepository.findById(
        data.categoriaId,
        comercioId,
      );
      if (!categoria) {
        throw new NotFoundError("Categoría no encontrada");
      }
    }

    const envioCostoUnidad = data.precioCompra !== undefined;
    const envioPrecioPaquete =
      data.precioCompraPaquete !== undefined &&
      data.precioCompraPaquete !== null;

    if (envioCostoUnidad && envioPrecioPaquete) {
      throw new BadRequestError(
        "Enviá el costo por unidad o el costo del paquete, no ambos",
      );
    }

    const unidadesActuales =
      (productoExistente.unidadesPorPaquete as number | undefined) ?? 1;
    const unidadesResultantes = data.unidadesPorPaquete ?? unidadesActuales;

    const paqueteResultante =
      data.precioCompraPaquete !== undefined
        ? data.precioCompraPaquete
        : (productoExistente.precioCompraPaquete as
            | Prisma.Decimal
            | null
            | undefined) ?? null;

    let costoResultante: Prisma.Decimal;
    if (envioCostoUnidad) {
      costoResultante = new Prisma.Decimal(data.precioCompra!);
    } else if (paqueteResultante !== null) {
      costoResultante = calcularPrecioCompraPorUnidad(
        paqueteResultante,
        unidadesResultantes,
      );
    } else {
      costoResultante = new Prisma.Decimal(productoExistente.precioCompra);
    }

    const nuevoPrecioVenta =
      data.precioVenta ?? productoExistente.precioVenta;

    if (!new Prisma.Decimal(nuevoPrecioVenta).gt(costoResultante)) {
      throw new BadRequestError(
        "El precio de venta debe ser mayor al de compra",
      );
    }

    if (data.codigoBarras !== undefined && data.codigoBarras !== null) {
      const existente = await productoRepository.findByCodigoBarras(
        comercioId,
        data.codigoBarras,
      );
      if (existente && existente.id !== id) {
        throw new ConflictError("Ya existe un producto con ese código de barras");
      }
    }

    const { categoriaId, ...resto } = data;
    const datosActualizacion: Prisma.ProductoUncheckedUpdateInput = {
      ...resto,
      precioCompra: costoResultante,
      unidadesPorPaquete: unidadesResultantes,
    };

    if (envioCostoUnidad) {
      datosActualizacion.precioCompraPaquete = null;
    } else if (data.precioCompraPaquete !== undefined) {
      datosActualizacion.precioCompraPaquete =
        data.precioCompraPaquete === null
          ? null
          : new Prisma.Decimal(data.precioCompraPaquete);
    }

    return productoRepository.update(id, comercioId, {
      ...datosActualizacion,
      ...(categoriaId !== undefined
        ? { categoria: { connect: { id: categoriaId } } }
        : {}),
    });
  },

  delete: async (id: number, comercioId: number) => {
    const producto = await productoRepository.findById(id, comercioId);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }
    return productoRepository.delete(id, comercioId);
  },
};
