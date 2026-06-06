# Document AI PoC

Local Docker-first proof of concept for a recreated Document Management System plus a future-state Document AI chatbot flow.

## What Is Included

- DMS API with `/api/v1` upload, query, metadata, PDF fetch, soft delete, health, and metrics endpoints.
- Local development persistence plus a Docker path for MySQL metadata and MongoDB GridFS PDF storage.
- DMS UI built with React, TypeScript, and TanStack Router.
- Wrapper API with environment-driven OCR and agent model catalogs.
- MCP wrapper services that call DMS APIs, not databases.
- A2A-style specialized agents for metadata, fetch, OCR, vector ingestion, and answering.
- Master agent with vector-first routing, latest/vector-only fetch options, and citation output.
- Chatbot UI built with React, TypeScript, and TanStack Router.

## Fast Local Run

```bash
pnpm install
pnpm dev
```

Open:

- Chatbot UI: http://localhost:3000, or http://localhost:3001 if Vite falls back because 3000 is busy
- DMS UI: http://localhost:3102
- Wrapper API models: http://localhost:3201/api/v1/models

Seed a demo PDF after the stack is running:

```bash
./scripts/seed-dms.sh
```

## Docker Run

```bash
./scripts/dev-up.sh
```

The Docker stack starts MySQL, MongoDB, Qdrant, all APIs, all agents, MCP wrappers, and both UIs.

## Validation

```bash
pnpm build
pnpm test
pnpm smoke
```

`pnpm smoke` expects the local stack to be running.

## Architecture Boundaries

- The DMS API is the only service that reads and writes DMS persistence.
- DMS UI calls only the DMS API.
- Chatbot UI calls only the wrapper API.
- Wrapper API validates model choices and calls the master agent.
- Master agent calls specialized agents over A2A-style endpoints.
- Specialized agents call MCP wrappers for DMS access.
- MCP wrappers call DMS APIs and never connect to MySQL or MongoDB.

## Environment

See `.env.example` for ports, service URLs, model allowlists, upload limits, and database settings.
