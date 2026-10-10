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

#. 6- generar el cliente de Prisma
RUN DATABASE_URL="postgresql://neondb_owner:npg_1lCO3uzonpZH@ep-rough-wind-a5vd2at1-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require" npx prisma generate

#. 7- exponer el puerto en el que la aplicación escuchará
EXPOSE 3000

#. 8- comando para ejecutar la aplicación
CMD ["npm", "start"]