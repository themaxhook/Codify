# ---------- Stage 1: Build React frontend ----------
FROM node:18 AS frontend-build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build


# ---------- Stage 2: Run backend ----------
FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Copy React build from stage 1
COPY --from=frontend-build /app/build ./build

EXPOSE 7000

CMD ["node", "server.js"]