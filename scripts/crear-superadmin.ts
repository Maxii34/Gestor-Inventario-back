import "dotenv/config";
import readline from "readline";
import { prisma } from "../src/config/prisma";
import { crearSuperadmin } from "../src/service/superadmin.service";

const leerArgumentos = (argv: string[]) => {
  const argumentos: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [clave, valorEnLinea] = arg.slice(2).split("=", 2);
    if (valorEnLinea !== undefined) {
      argumentos[clave] = valorEnLinea;
      continue;
    }

    const siguiente = argv[i + 1];
    if (siguiente !== undefined && !siguiente.startsWith("--")) {
      argumentos[clave] = siguiente;
      i++;
    }
  }

  return argumentos;
};

const preguntar = (
  rl: readline.Interface,
  texto: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    rl.question(texto, (respuesta) => resolve(respuesta));
    rl.once("error", reject);
  });

const leerPasswordInteractiva = async (): Promise<string> => {
  if (!process.stdin.isTTY) {
    throw new Error(
      "SUPERADMIN_PASSWORD no está definida y no hay una terminal interactiva para pedirla"
    );
  }

  // Sin raw mode: la terminal maneja la línea normalmente y no se oculta la
  // entrada. La contraseña nunca se imprime por nuestra cuenta.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  try {
    const password = await preguntar(
      rl,
      "Contraseña del superadmin (no se verá lo que escribís): "
    );
    const confirmacion = await preguntar(rl, "Confirmá la contraseña: ");

    if (password !== confirmacion) {
      throw new Error("Las contraseñas no coinciden");
    }

    return password;
  } finally {
    rl.close();
  }
};

const main = async () => {
  const { nombre, email } = leerArgumentos(process.argv.slice(2));

  if (!nombre || !email) {
    throw new Error(
      'Uso: npm run superadmin:crear -- --nombre "Nombre" --email "email@dominio.com"'
    );
  }

  const password =
    process.env.SUPERADMIN_PASSWORD ?? (await leerPasswordInteractiva());

  const superadmin = await crearSuperadmin({ nombre, email, password });

  console.log(`Superadmin creado: ${superadmin.email}`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
