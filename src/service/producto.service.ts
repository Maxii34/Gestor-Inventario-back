import { productoRepository } from "../repositores/producto.repository";
import { categoriaRepository } from "../repositores/categoria.repository";
import { NotFoundError, BadRequestError } from "../utils/errors";

interface CrearProductoDTO {
  nombre: string;
  descripcion?: string;
  precioCompra: number;
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

  create: async (data: CrearProductoDTO, comercioId: number) => {
    if (
      !data.nombre ||
      !data.precioCompra ||
      !data.precioVenta ||
      !data.stock
    ) {
      throw new BadRequestError(
        "Nombre, precio de compra, precio de venta y stock son obligatorios",
      );
    }
    if (data.precioVenta <= data.precioCompra) {
      throw new BadRequestError("El precio de venta debe ser mayor al de compra");
    }

    // La categoría debe existir Y pertenecer al mismo comercio: si es de otro
    // comercio (o no existe) se responde 404 sin confirmar cuál es el caso.
    const categoria = await categoriaRepository.findById(data.categoriaId, comercioId);
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada");
    }

    return productoRepository.create({
      ...data,
      activo: true,
      comercio: { connect: { id: comercioId } },
      categoria: { connect: { id: data.categoriaId } },
    });
  },

  update: async (id: number, comercioId: number, data: ActualizarProductoDTO) => {
    const productoExistente = await productoRepository.findById(id, comercioId);
    if (!productoExistente) {
      throw new NotFoundError("El producto no existe");
    }

    if (data.categoriaId !== undefined) {
      const categoria = await categoriaRepository.findById(data.categoriaId, comercioId);
      if (!categoria) {
        throw new NotFoundError("Categoría no encontrada");
      }
    }

    const nuevoPrecioCompra =
      data.precioCompra ?? productoExistente.precioCompra;
    const nuevoPrecioVenta = data.precioVenta ?? productoExistente.precioVenta;

    if (Number(nuevoPrecioVenta) <= Number(nuevoPrecioCompra)) {
      throw new BadRequestError("El precio de venta debe ser mayor al de compra");
    }

    const { categoriaId, ...resto } = data;
    return productoRepository.update(id, {
      ...resto,
      ...(categoriaId !== undefined ? { categoria: { connect: { id: categoriaId } } } : {}),
    });
  },

  delete: async (id: number, comercioId: number) => {
    const producto = await productoRepository.findById(id, comercioId);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }
    return productoRepository.delete(id);
  },
};
