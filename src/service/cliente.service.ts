import { clienteRepository } from "../repositores/cliente.repository";
import { NotFoundError } from "../utils/errors";

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
      throw new NotFoundError("Cliente no encontrado"); 
    }
    return cliente;
  },

  create: (data: CrearClienteDTO) => clienteRepository.create(data),

  update: async (id: number, data: ActualizarClienteDTO) => {
    const cliente = await clienteRepository.findById(id);
    if (!cliente) {
      throw new NotFoundError("Cliente no encontrado");
    }
    return clienteRepository.update(id, data);
  },

  delete: async (id: number) => {
    const cliente = await clienteRepository.findById(id);
    if (!cliente) {
      throw new NotFoundError("Cliente no encontrado");
    }
    return clienteRepository.delete(id);
  },
};