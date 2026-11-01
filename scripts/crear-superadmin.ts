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

const leerPasswordOculta = (): Promise<string> => {
  if (!process.stdin.isTTY) {
    return Promise.reject(
      new Error(
        "SUPERADMIN_PASSWORD no está definida y no hay una terminal para pedirla"
      )
    );
  }

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Impide que readline escriba los caracteres tipeados en la terminal.
    (rl as unknown as { _writeToOutput: (texto: string) => void })._writeToOutput =
      () => {};

    process.stdout.write("Contraseña del superadmin: ");

    rl.question("", (respuesta) => {
      process.stdout.write("\n");
      rl.close();
      resolve(respuesta);
    });

    rl.on("error", (error) => {
      rl.close();
      reject(error);
    });
  });
};

const main = async () => {
  const { nombre, email } = leerArgumentos(process.argv.slice(2));

  if (!nombre || !email) {
    console.error(
      'Uso: npm run superadmin:crear -- --nombre "Nombre" --email "email@dominio.com"'
    );
    process.exitCode = 1;
    return;
  }

  const password =
    process.env.SUPERADMIN_PASSWORD ?? (await leerPasswordOculta());

  const superadmin = await crearSuperadmin({ nombre, email, password });

  console.log(
    `Superadmin creado: id=${superadmin.id} nombre=${superadmin.nombre} email=${superadmin.email}`
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
