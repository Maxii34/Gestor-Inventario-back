import express from "express";
import cors from "cors";
import morgan from "morgan";
import categoriaRoutes from "./routes/categoria.routes";
import productoRoutes from "./routes/producto.routes";
import movimientoRoutes from "./routes/movimiento.routes";

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

export default app;