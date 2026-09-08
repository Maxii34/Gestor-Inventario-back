// Clase base para todos los errores "esperados" de la aplicación (errores de
// negocio, no bugs). Cada uno lleva su propio statusCode HTTP correspondiente.
export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name; // nombre de la clase real (ej: "NotFoundError"), útil para logs
    Object.setPrototypeOf(this, new.target.prototype); // fix de instanceof en clases que extienden Error
  }
}

// 404 - algo que se buscó por id/clave no existe (producto, cliente, venta...)
export class NotFoundError extends AppError {
  constructor(message: string = "Recurso no encontrado") {
    super(message, 404);
  }
}

// 409 - conflicto de negocio: stock insuficiente, email duplicado, ya existe un admin...
export class ConflictError extends AppError {
  constructor(message: string = "Conflicto con el estado actual del recurso") {
    super(message, 409);
  }
}

// 400 - datos inválidos que no llegaron a cubrirse con Zod, o validaciones puntuales de negocio
export class BadRequestError extends AppError {
  constructor(message: string = "Solicitud inválida") {
    super(message, 400);
  }
}

// 401 - no autenticado (sin token, token inválido/expirado)
export class UnauthorizedError extends AppError {
  constructor(message: string = "No autenticado") {
    super(message, 401);
  }
}

// 403 - autenticado pero sin permiso para esta acción (rol incorrecto)
export class ForbiddenError extends AppError {
  constructor(message: string = "Acceso denegado") {
    super(message, 403);
  }
}