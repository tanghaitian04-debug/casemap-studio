FROM node:22-bookworm-slim
RUN apt-get update && apt-get install --no-install-recommends -y ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /app/output && chown node:node /app/output
USER node
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node","server/private-render.mjs"]
