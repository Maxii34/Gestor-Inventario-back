import bcrypt from "bcrypt";
import { superadminRepository } from "../repositores/superadmin.repository";
import { BadRequestError, ConflictError } from "../utils/errors";

export interface CrearSuperadminDTO {
  nombre: string;
  email: string;
  password: string;
}

const BYTES_MINIMOS_PASSWORD = 6;
const BYTES_MAXIMOS_PASSWORD = 72;

export const crearSuperadmin = async ({
  nombre,
  email,
  password,
}: CrearSuperadminDTO) => {
  const bytesPassword = Buffer.byteLength(password, "utf8");
  if (
    bytesPassword < BYTES_MINIMOS_PASSWORD ||
    bytesPassword > BYTES_MAXIMOS_PASSWORD
  ) {
    throw new BadRequestError(
      `La contraseña debe tener entre ${BYTES_MINIMOS_PASSWORD} y ${BYTES_MAXIMOS_PASSWORD} bytes`
    );
  }

  const emailNormalizado = email.trim().toLowerCase();
  const existente = await superadminRepository.findByEmail(emailNormalizado);
  if (existente) {
    throw new ConflictError("Ya existe un superadmin con ese email");
  }

  const passwordHasheada = await bcrypt.hash(password, 10);

  const superadmin = await superadminRepository.create({
    nombre,
    email: emailNormalizado,
    password: passwordHasheada,
  });

  const { password: _password, ...superadminSinPassword } = superadmin;
  return superadminSinPassword;
};

export const superadminService = {
  crearSuperadmin,
};
