import express from "express";
import cors from "cors";
import morgan from "morgan";
import categoriaRoutes from "./routes/categoria.routes";
import productoRoutes from "./routes/producto.routes";
import movimientoRoutes from "./routes/movimiento.routes";
import clienteRoutes from "./routes/cliente.routes";
import ventaRoutes from "./routes/venta.routes";
import usuarioRoutes from "./routes/usuario.routes";
import { errorHandler } from "./middlewares/errorHandler";
import estadisticaRoutes from "./routes/estadistica.routes";

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

app.use("/categorias", categoriaRoutes);
app.use("/productos", productoRoutes);
app.use("/movimientos", movimientoRoutes);
app.use("/clientes", clienteRoutes);
app.use("/ventas", ventaRoutes);
app.use("/usuarios", usuarioRoutes);
app.use("/estadisticas", estadisticaRoutes);

// Cualquier error lanzado dentro de un controller async cae acá.
app.use(errorHandler);

export default app;