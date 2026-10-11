FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install --with-deps chromium
RUN apt-get update && apt-get install -y --no-install-recommends android-tools-adb && rm -rf /var/lib/apt/lists/*
COPY . .
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.mjs"]
