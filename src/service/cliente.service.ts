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
  getAll: async (comercioId: number, page: number, limit: number) => {
    const skip = (page - 1) * limit;

    // Pedimos los datos de la página Y el total en paralelo (Promise.all),
    // en vez de uno después del otro, para que sea más rápido.
    const [clientes, total] = await Promise.all([
      clienteRepository.findAll(comercioId, skip, limit),
      clienteRepository.count(comercioId),
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

  getById: async (id: number, comercioId: number) => {
    const cliente = await clienteRepository.findById(id, comercioId);
    if (!cliente || !cliente.activo) {
      throw new NotFoundError("Cliente no encontrado");
    }
    return cliente;
  },

  create: (data: CrearClienteDTO, comercioId: number) => {
    // Las colisiones de dni/email por comercio las rechaza la BD (P2002 → 409
    // con mensaje genérico en el errorHandler central).
    return clienteRepository.create({
      ...data,
      email: data.email?.trim().toLowerCase() || undefined,
      dni: data.dni?.trim() || undefined,
      comercio: { connect: { id: comercioId } },
    });
  },

  update: async (id: number, comercioId: number, data: ActualizarClienteDTO) => {
    const cliente = await clienteRepository.findById(id, comercioId);
    if (!cliente || !cliente.activo) {
      throw new NotFoundError("Cliente no encontrado");
    }
    return clienteRepository.update(id, comercioId, {
      ...data,
      email: data.email?.trim().toLowerCase(),
      dni: data.dni?.trim(),
    });
  },

  delete: async (id: number, comercioId: number) => {
    const cliente = await clienteRepository.findById(id, comercioId);
    if (!cliente || !cliente.activo) {
      throw new NotFoundError("Cliente no encontrado");
    }
    return clienteRepository.delete(id, comercioId);
  },
};
