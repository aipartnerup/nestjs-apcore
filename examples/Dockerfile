# Build context: the nestjs-apcore/ root (one level up from this file).
# Usage:
#   docker compose up --build          (from examples/)
#   docker build -t nestjs-apcore-demo -f examples/Dockerfile ..  (from nestjs-apcore/)

FROM node:20-alpine

WORKDIR /workspace/nestjs-apcore

# ---- Build nestjs-apcore library ----
COPY package*.json ./
RUN npm install
COPY src/ ./src/
COPY tsconfig*.json ./
RUN npm run build

# ---- Install demo dependencies ----
COPY examples/package*.json ./examples/
WORKDIR /workspace/nestjs-apcore/examples
RUN npm install

# ---- Copy demo source ----
COPY examples/src/ ./src/
COPY examples/tsconfig.json ./

EXPOSE 3000 8000

CMD ["npx", "tsx", "src/main.ts"]
