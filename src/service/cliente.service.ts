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
  // Recibe page/limit ya como números.
  getAll: async (page: number, limit: number) => {
    const skip = (page - 1) * limit;

    // Pedimos los datos de la página Y el total en paralelo (Promise.all),
    // en vez de uno después del otro, para que sea más rápido.
    const [clientes, total] = await Promise.all([
      clienteRepository.findAll(skip, limit),
      clienteRepository.count(),
    ]);

    return {
      data: clientes,
      meta: {
        total,
        page,
        limit,
        totalPaginas: Math.ceil(total / limit),
      },
    };
  },

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