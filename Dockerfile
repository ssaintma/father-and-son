# Image commune Railway / Fly.io — sert la one-page + l'API de signature Wallet.
FROM node:20-alpine

WORKDIR /app

# Dépendances du serveur (couche cachée tant que package*.json ne change pas)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

# Code : index.html (servi depuis /app) + server/
COPY index.html ./index.html
COPY server ./server

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

WORKDIR /app/server
CMD ["node", "index.js"]
