import { productoRepository } from "../repositores/producto.repository";

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
  getAllProductos: () => productoRepository.findAll(),

  getById: async (id: number) => {
    const producto = await productoRepository.findById(id);
    if (!producto) {
      throw new Error("Producto no encontrado");
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
      throw new Error(
        "Nombre, precio de compra, precio de venta y stock son obligatorios",
      );
    }
    if (data.precioVenta <= data.precioCompra) {
      throw new Error("El precio de venta debe ser mayor al de compra");
    }

    return productoRepository.create({
      ...data,
      activo: true,
    });
  },

  update: async (id: number, data: ActualizarProductoDTO) => {
    // 1. Verificar que el producto exista antes de intentar actualizar
    const productoExistente = await productoRepository.findById(id);
    if (!productoExistente) {
      throw new Error("El producto no existe");
    }

    // 2. Validar precios SOLO si el usuario los está actualizando
    const nuevoPrecioCompra =
      data.precioCompra ?? productoExistente.precioCompra;
    const nuevoPrecioVenta = data.precioVenta ?? productoExistente.precioVenta;

    if (Number(nuevoPrecioVenta) <= Number(nuevoPrecioCompra)) {
      throw new Error("El precio de venta debe ser mayor al de compra");
    }

    return productoRepository.update(id, data);
  },

  delete: async (id: number) => {
    const producto = await productoRepository.findById(id);
    if (!producto) {
      throw new Error("Producto no encontrado");
    }
    return productoRepository.delete(id);
  },
};
