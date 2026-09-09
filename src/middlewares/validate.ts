// middlewares/validate.ts
import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

export const validate = (schema: ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body); // valida y sobreescribe req.body ya "limpio"
      next(); // todo bien, sigue al controller
    } catch (error: any) {
      res.status(400).json({
        ok: false,
        mensaje: error.issues?.[0]?.message ?? "Datos inválidos",
      });
    }
  };
};