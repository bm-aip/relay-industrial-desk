FROM node:24-slim
WORKDIR /app
COPY package.json server.mjs ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]
