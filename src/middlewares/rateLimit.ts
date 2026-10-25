import rateLimit from "express-rate-limit";

// Los límites se cuentan por IP. El contador vive en memoria del proceso:
// se reinicia al reiniciar el servidor (y en serverless no se comparte entre
// instancias). Alcanza para frenar abuso básico; para algo más estricto haría
// falta un almacén compartido (por ejemplo Redis).

const mensaje = (texto: string) => ({ ok: false, mensaje: texto });

// Login: solo cuenta los intentos FALLIDOS. Frena la fuerza bruta de
// contraseñas sin molestar a quien entra bien.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje("Demasiados intentos de inicio de sesión. Probá de nuevo en 15 minutos."),
});

// Alta de comercios: es el único endpoint público de escritura (crea filas y
// calcula bcrypt), así que es el más caro de abusar.
export const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje("Demasiados registros desde esta dirección. Probá de nuevo más tarde."),
});

// Límite general, generoso a propósito: un comercio con varias cajas comparte
// la misma IP. El webhook de Mercado Pago queda afuera para no perder
// notificaciones de pago.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.startsWith("/ventas/webhook"),
  message: mensaje("Demasiadas solicitudes. Probá de nuevo en unos minutos."),
});