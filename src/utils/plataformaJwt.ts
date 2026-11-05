export const obtenerSecretoPlataforma = () => {
  const secreto = process.env.PLATAFORMA_JWT_SECRET;
  if (!secreto) {
    console.error(
      "PLATAFORMA_JWT_SECRET no está definida: los endpoints de plataforma no pueden autenticar"
    );
    throw new Error("Configuración de plataforma incompleta");
  }
  return secreto;
};
