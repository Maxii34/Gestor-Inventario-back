import express from "express";
import cors from "cors";
import categoriaRoutes from "./routes/categoria.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

app.use("/categorias", categoriaRoutes);

export default app;