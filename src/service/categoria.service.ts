import { categoriaRepository } from "../repositores/categoria.repository";
import { NotFoundError, BadRequestError } from "../utils/errors"; // clases de error propias

export const categoriaService = {
  getAll: (comercioId: number) => categoriaRepository.findAll(comercioId),

  getById: async (id: number, comercioId: number) => {
    const categoria = await categoriaRepository.findById(id, comercioId);
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada"); // antes: new Error(...)
    }
    return categoria;
  },

  create: (data: { nombre: string; descripcion?: string }, comercioId: number) => {
    if (!data.nombre || data.nombre.trim() === "") {
      throw new BadRequestError("El nombre es obligatorio"); // dato inválido, no "no encontrado"
    }
    return categoriaRepository.create({
      ...data,
      comercio: { connect: { id: comercioId } },
    });
  },

  update: async (
    id: number,
    comercioId: number,
    data: { nombre?: string; descripcion?: string },
  ) => {
    const categoria = await categoriaRepository.findById(id, comercioId);
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada");
    }
    return categoriaRepository.update(id, data);
  },

  delete: async (id: number, comercioId: number) => {
    const categoria = await categoriaRepository.findById(id, comercioId);
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada");
    }
    return categoriaRepository.delete(id);
  },
};
