# The relayer as a standalone service. Build from the repo root (it needs config/devnet.json and
# the Anchor clients in anchor/), e.g. `docker build -f relayer/Dockerfile .`.
#
# Only the relayer's own dependencies are installed — not the Expo app's. They go in /app's
# node_modules so both relayer/src and anchor/src resolve them.
# Pinned by digest so the base can't change between builds; bump it deliberately
# (`docker pull node:22-slim` and copy the new digest).
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

WORKDIR /app
COPY relayer/package.json ./package.json
RUN npm install --omit=dev && npm install --no-save tsx@4 && npm cache clean --force

COPY config ./config
COPY anchor/src ./anchor/src
COPY anchor/target/idl ./anchor/target/idl
COPY relayer/src ./relayer/src

# Run as the image's unprivileged `node` user. The faucet claim ledger (relayer/.data, see
# src/faucet.ts) is the only thing the relayer writes, so that's the only directory it owns.
RUN mkdir -p relayer/.data && chown node:node relayer/.data
USER node

ENV NODE_ENV=production
# The host sets PORT; 8787 is the local default.
EXPOSE 8787
CMD ["npx", "tsx", "relayer/src/index.ts"]
