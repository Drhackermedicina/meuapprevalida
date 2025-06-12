# Usa a imagem base oficial do Node.js
FROM node:20-slim

# Define o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copia o package.json e package-lock.json (se existir)
COPY package*.json ./

# Instala as dependências do Node.js
RUN npm install

# Copia o restante do código da aplicação
COPY . .

# Expõe a porta que sua aplicação Node.js vai escutar
EXPOSE 3000

# Define a variável de ambiente para a porta
ENV PORT 3000

# Comando para iniciar a aplicação
CMD [ "node", "server.js" ]