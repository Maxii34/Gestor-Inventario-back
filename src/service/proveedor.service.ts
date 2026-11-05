import { proveedorRepository } from "../repositores/proveedor.repository";
import { NotFoundError, ConflictError } from "../utils/errors";
import {
  CrearProveedorInput,
  ActualizarProveedorInput,
} from "../validators/proveedor.validation";

export const proveedorService = {
  getAll: async (comercioId: number, page: number, limit: number) => {
    const skip = (page - 1) * limit;

    const [proveedores, total] = await Promise.all([
      proveedorRepository.findAll(comercioId, skip, limit),
      proveedorRepository.count(comercioId),
    ]);

    return {
      data: proveedores,
      meta: { total, page, limit, totalPaginas: Math.ceil(total / limit) },
    };
  },

  getById: async (id: number, comercioId: number) => {
    const proveedor = await proveedorRepository.findById(id, comercioId);
    if (!proveedor) {
      throw new NotFoundError("Proveedor no encontrado");
    }
    return proveedor;
  },

  create: async (data: CrearProveedorInput, comercioId: number) => {
    const existente = await proveedorRepository.findByNombre(data.nombre, comercioId);
    if (existente) {
      throw new ConflictError("Ya existe un proveedor con ese nombre");
    }

    return proveedorRepository.create({
      ...data,
      comercio: { connect: { id: comercioId } },
    });
  },

  update: async (id: number, comercioId: number, data: ActualizarProveedorInput) => {
    const proveedor = await proveedorRepository.findById(id, comercioId);
    if (!proveedor) {
      throw new NotFoundError("Proveedor no encontrado");
    }

    if (data.nombre !== undefined && data.nombre !== proveedor.nombre) {
      const otro = await proveedorRepository.findByNombre(data.nombre, comercioId);
      if (otro && otro.id !== id) {
        throw new ConflictError("Ya existe un proveedor con ese nombre");
      }
    }

    return proveedorRepository.update(id, comercioId, data);
  },

  delete: async (id: number, comercioId: number) => {
    const proveedor = await proveedorRepository.findById(id, comercioId);
    if (!proveedor) {
      throw new NotFoundError("Proveedor no encontrado");
    }
    return proveedorRepository.delete(id, comercioId);
  },
};