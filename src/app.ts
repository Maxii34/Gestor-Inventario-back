import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import categoriaRoutes from "./routes/categoria.routes";
import productoRoutes from "./routes/producto.routes";
import movimientoRoutes from "./routes/movimiento.routes";
import clienteRoutes from "./routes/cliente.routes";
import ventaRoutes from "./routes/venta.routes";
import usuarioRoutes from "./routes/usuario.routes";
import { errorHandler } from "./middlewares/errorHandler";
import { generalLimiter } from "./middlewares/rateLimit";
import estadisticaRoutes from "./routes/estadistica.routes";
import comercioRoutes from "./routes/comercio.routes";
import proveedorRoutes from "./routes/proveedor.routes";

const app = express();

// Detrás de Vercel (u otro proxy) la IP real llega en X-Forwarded-For.
// Sin esto, el rate limit vería la IP del proxy y todos compartirían contador.
app.set("trust proxy", 1);

// Cabeceras de seguridad estándar.
app.use(helmet());

// CORS: los orígenes permitidos se definen en CORS_ORIGINS, separados por coma
// (ej: "https://mi-frontend.vercel.app,http://localhost:3000").
// - Producción sin CORS_ORIGINS: se bloquean los navegadores de otros orígenes.
// - Desarrollo sin CORS_ORIGINS: se permite todo para no trabarte.
// Bruno, Postman y el webhook de Mercado Pago no usan CORS (no son navegadores).
const origenesPermitidos = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const esProduccion = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin:
      origenesPermitidos.length > 0 ? origenesPermitidos : esProduccion ? false : true,
  })
);

app.use(generalLimiter);
app.use(morgan("dev"));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

app.use("/categorias", categoriaRoutes);
app.use("/productos", productoRoutes);
app.use("/proveedores", proveedorRoutes);
app.use("/movimientos", movimientoRoutes);
app.use("/clientes", clienteRoutes);
app.use("/ventas", ventaRoutes);
app.use("/usuarios", usuarioRoutes);
app.use("/estadisticas", estadisticaRoutes);
app.use("/comercios", comercioRoutes);

// Cualquier error lanzado dentro de un controller async cae acá.
app.use(errorHandler);

export default app;