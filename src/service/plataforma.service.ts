import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { superadminRepository } from "../repositores/superadmin.repository";
import { UnauthorizedError } from "../utils/errors";
import { obtenerSecretoPlataforma } from "../utils/plataformaJwt";

export interface LoginPlataformaDTO {
  email: string;
  password: string;
}

const DURACION_TOKEN_PLATAFORMA = "2h";

const login = async (data: LoginPlataformaDTO) => {
  const superadmin = await superadminRepository.findByEmail(
    data.email.trim().toLowerCase()
  );

  if (!superadmin || !superadmin.activo) {
    throw new UnauthorizedError("Credenciales inválidas");
  }

  const passwordValida = await bcrypt.compare(data.password, superadmin.password);
  if (!passwordValida) {
    throw new UnauthorizedError("Credenciales inválidas");
  }

  const accessToken = jwt.sign(
    { sub: superadmin.id, tipo: "plataforma" },
    obtenerSecretoPlataforma(),
    { expiresIn: DURACION_TOKEN_PLATAFORMA } as jwt.SignOptions
  );

  return {
    accessToken,
    token: accessToken,
    superadmin: {
      id: superadmin.id,
      nombre: superadmin.nombre,
      email: superadmin.email,
    },
  };
};

export const plataformaService = {
  login,
};
