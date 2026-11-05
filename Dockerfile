#. 1- imagen base con node
FROM node:22-alpine

#. 2- directorio de trabajo dentro del contenedor
WORKDIR /app

#. 3- copiar package.json y package-lock.json
COPY package*.json ./

#. 4- copiar el resto de la aplicación
COPY . .

#. 5- instalar dependencias
RUN npm install --ignore-scripts

#. 6- generar el cliente de Prisma (usa un valor temporal no secreto solo para el build;
#. en runtime la app toma DATABASE_URL real desde el entorno / env_file, nunca hardcodeada acá)
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate

#. 7- exponer el puerto en el que la aplicación escuchará
EXPOSE 3000

#. 8- comando para ejecutar la aplicación
CMD ["npm", "start"]