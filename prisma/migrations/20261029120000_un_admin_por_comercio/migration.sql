-- Un solo ADMIN activo por comercio, garantizado por la base de datos.
-- Migracion escrita a mano: Prisma no puede expresar indices parciales en
-- schema.prisma. El WHERE coincide con lo que cuenta el service (findByRol
-- solo trae usuarios activos): desactivar a un admin libera su lugar.
CREATE UNIQUE INDEX "Usuario_un_admin_activo_por_comercio"
  ON "Usuario" ("comercioId")
  WHERE "rol" = 'ADMIN' AND "activo" = true;