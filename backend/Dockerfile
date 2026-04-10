FROM node:20-bullseye
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN mkdir -p /app/data
CMD ["sh", "-c", "node server.js & node listener.js && wait"]
