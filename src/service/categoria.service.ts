import { categoriaRepository } from "../repositores/categoria.repository";

export const categoriaService = {
  getAll: () => categoriaRepository.findAll(),

  getById: async (id: number) => {
    const categoria = await categoriaRepository.findById(id);
    if (!categoria) {
      throw new Error("Categoría no encontrada");
    }
    return categoria;
  },

  create: (data: { nombre: string; descripcion?: string }) => {
    if (!data.nombre || data.nombre.trim() === "") {
      throw new Error("El nombre es obligatorio");
    }
    return categoriaRepository.create(data);
  },

  update: (id: number, data: { nombre?: string; descripcion?: string }) =>
    categoriaRepository.update(id, data),

  delete: (id: number) => categoriaRepository.delete(id),
};