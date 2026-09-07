import { clienteRepository } from "../repositores/cliente.repository";

export interface CrearClienteDTO {
  nombre: string;
  apellido: string;
  dni?: string;
  telefono?: string;
  email?: string;
}

export interface ActualizarClienteDTO {
  nombre?: string;
  apellido?: string;
  dni?: string;
  telefono?: string;
  email?: string;
}

export const clienteService = {
  getAll: () => clienteRepository.findAll(),

  getById: async (id: number) => {
    const cliente = await clienteRepository.findById(id);
    if (!cliente) {
      throw new Error("Cliente no encontrado");
    }
    return cliente;
  },

  create: (data: CrearClienteDTO) => clienteRepository.create(data),

  update: (id: number, data: ActualizarClienteDTO) =>
    clienteRepository.update(id, data),

  delete: (id: number) => clienteRepository.delete(id),
};