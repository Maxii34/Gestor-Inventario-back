import { productoRepository } from "../repositores/producto.repository";
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
  getAll: async (page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [productos, total] = await Promise.all([
      productoRepository.findAll(skip, limit),
      productoRepository.count(),
    ]);

    return {
      data: productos,
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  },

  getById: async (id: number) => {
    const producto = await productoRepository.findById(id);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }
    return producto;
  },

  create: (data: CrearProductoDTO) => {
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

    return productoRepository.create({
      ...data,
      activo: true,
    });
  },

  update: async (id: number, data: ActualizarProductoDTO) => {
    const productoExistente = await productoRepository.findById(id);
    if (!productoExistente) {
      throw new NotFoundError("El producto no existe");
    }

    const nuevoPrecioCompra =
      data.precioCompra ?? productoExistente.precioCompra;
    const nuevoPrecioVenta = data.precioVenta ?? productoExistente.precioVenta;

    if (Number(nuevoPrecioVenta) <= Number(nuevoPrecioCompra)) {
      throw new BadRequestError("El precio de venta debe ser mayor al de compra");
    }

    return productoRepository.update(id, data);
  },

  delete: async (id: number) => {
    const producto = await productoRepository.findById(id);
    if (!producto) {
      throw new NotFoundError("Producto no encontrado");
    }
    return productoRepository.delete(id);
  },
};