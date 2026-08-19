FROM node:20-alpine

WORKDIR /app

# python3/make/g++ werden nur für den better-sqlite3 Build gebraucht (falls kein
# passendes Prebuild für Alpine/Node20 verfügbar ist).
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public
COPY scripts ./scripts

ENV NODE_ENV=production
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "src/server.js"]
