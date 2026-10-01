# Production image for the API. Secrets come from the environment at run time
# (docker run --env-file .env); .env is never copied into the image.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

USER node
EXPOSE 3001
CMD ["node", "src/index.js"]
