import { categoriaRepository } from "../repositores/categoria.repository";
import { NotFoundError, BadRequestError } from "../utils/errors"; // clases de error propias

export const categoriaService = {
  getAll: () => categoriaRepository.findAll(),

  getById: async (id: number) => {
    const categoria = await categoriaRepository.findById(id);
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada"); // antes: new Error(...)
    }
    return categoria;
  },

  create: (data: { nombre: string; descripcion?: string }) => {
    if (!data.nombre || data.nombre.trim() === "") {
      throw new BadRequestError("El nombre es obligatorio"); // dato inválido, no "no encontrado"
    }
    return categoriaRepository.create(data);
  },

  update: async (
    id: number,
    data: { nombre?: string; descripcion?: string },
  ) => {
    const categoria = await categoriaRepository.findById(id);
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada");
    }
    return categoriaRepository.update(id, data);
  },

  delete: async (id: number) => {
    const categoria = await categoriaRepository.findById(id); // de paso corregí "actegoria" -> "categoria"
    if (!categoria) {
      throw new NotFoundError("Categoría no encontrada");
    }
    return categoriaRepository.delete(id);
  },
};