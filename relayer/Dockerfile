# The relayer as a standalone service. Build from the repo root (it needs config/devnet.json and
# the Anchor clients in anchor/), e.g. `docker build -f relayer/Dockerfile .`.
#
# Only the relayer's own dependencies are installed — not the Expo app's. They go in /app's
# node_modules so both relayer/src and anchor/src resolve them.
FROM node:22-slim

WORKDIR /app
COPY relayer/package.json ./package.json
RUN npm install --omit=dev && npm install --no-save tsx@4 && npm cache clean --force

COPY config ./config
COPY anchor/src ./anchor/src
COPY anchor/target/idl ./anchor/target/idl
COPY relayer/src ./relayer/src

ENV NODE_ENV=production
# The host sets PORT; 8787 is the local default.
EXPOSE 8787
CMD ["npx", "tsx", "relayer/src/index.ts"]
