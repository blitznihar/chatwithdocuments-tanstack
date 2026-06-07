# INSTRUCTION.md

## Document AI PoC - Coding-Agent Implementation Instructions

**Document purpose:** This file is the authoritative implementation guide for coding agents and engineers building the local Document AI proof of concept.

**Updated scope:** This PoC must recreate the current-state Document Management System (DMS), including:

1. A DMS API that stores PDF metadata and handle IDs in MySQL.
2. A DMS document store that stores PDFs in MongoDB GridFS.
3. A DMS UI that allows users to upload, search, view, and download documents through the DMS API.
4. The future-state chatbot, wrapper API, agentic AI services, MCP wrappers, A2A agents, OCR pipeline, vector database, and answer flow.

This is a local Docker-first PoC. Every service must be independently runnable, testable, observable, and configurable through environment variables.

---

## 1. Objective

Build a complete local proof of concept that demonstrates both the recreated current state and the desired future state.

The current-state DMS must support document upload, metadata persistence, document storage, document query, and document fetch by handle ID.

The future-state AI layer must allow a user to ask questions through a chatbot. The chatbot must route requests through wrapper APIs, a master agent, specialized agents, MCP tools, A2A communication, OCR extraction, vector indexing, and vector-based answering.

The final result must prove this end-to-end path:

1. A user uploads a PDF and metadata through the DMS UI.
2. The DMS UI calls the DMS API.
3. The DMS API stores metadata and handle ID in MySQL.
4. The DMS API stores the PDF in MongoDB GridFS.
5. A user asks a question in the chatbot UI.
6. The chatbot API calls the master agent through a wrapper API.
7. The master agent checks the vector database first.
8. If more content is required, the master agent uses A2A to call specialized agents.
9. Specialized agents call MCP wrappers.
10. MCP wrappers call the DMS API only; they must not read DMS databases directly.
11. Documents are fetched, OCR text is extracted, content is indexed, and the answer agent responds using vector database content.

---

## 2. Known Requirements

### 2.1 Current-State DMS Requirements

The PoC must build a local DMS implementation with these capabilities:

- Store document metadata in MySQL.
- Store PDF content in MongoDB GridFS.
- Generate and persist a stable document `handleId`.
- Provide a Fetch Document API that accepts `handleId` and returns the PDF document.
- Provide a Query Documents API that accepts metadata filters and returns matching handle IDs, metadata, and document type.
- Provide an Upload Document API that accepts a PDF and metadata from the DMS UI.
- Provide a DMS UI for document upload, search, metadata view, and PDF download.
- Support seeded test data for local demos and automated tests.

### 2.2 Future-State AI Requirements

The PoC must also build:

- Chatbot UI using TanStack and TypeScript.
- Chatbot UI with two model-selection dropdowns populated from API-provided allowlists, not hardcoded UI constants: one dropdown for OCR/VLM extraction and one dropdown for the rest of the agentic functionality.
- Wrapper API using Node.js and Fastify.
- Agentic AI API using Node.js and Fastify.
- Master agent that performs routing and orchestration.
- Specialized agents exposed over A2A.
- MCP wrappers that call DMS APIs.
- OCR agent for PDF text extraction.
- Vector ingestion agent.
- Answer agent that answers questions from the vector database.
- Vector-first behavior before fetching more documents.
- User choice for minimum documents versus all documents.
- User choice for latest or delta-only document fetching.
- Independent testability for every API, agent, MCP server, and A2A endpoint.

---

## 3. Assumptions

Use these assumptions unless an ADR overrides them.

1. This is a local Docker PoC, not a production deployment.
2. MySQL is the metadata source of truth for the DMS.
3. MongoDB GridFS is the source of truth for PDF binary content.
4. Qdrant is the local vector database.
5. The AI layer must never directly query MySQL or MongoDB for DMS data.
6. The AI layer must access documents only through MCP wrappers that call DMS APIs.
7. The DMS API is the only service allowed to directly read and write DMS MySQL and MongoDB data.
8. The DMS UI is a first-class app in the repository, separate from the chatbot UI.
9. Local authentication may be simplified for the PoC, but authentication and authorization boundaries must be represented.
10. All service URLs, ports, credentials, model names, and feature flags must come from environment variables.
11. PDF upload size limits, allowed MIME types, CORS origins, and API keys must be configurable.
12. Docker Model Runner or another local OpenAI-compatible model endpoint is available through an environment variable.

---

## 4. Unknowns and Validation Items

The implementation must not hide these uncertainties.

| Unknown | Why It Matters | Required Validation |
|---|---|---|
| Exact production DMS schema | Current PoC schema may differ from real DMS | Keep schema simple and document mapping assumptions |
| Real metadata taxonomy | Document types and policy fields may vary | Make document types configurable or seedable |
| Real PDF quality | OCR accuracy depends on source PDF quality | Add searchable-text PDFs and scanned-image PDFs to fixtures |
| Model quality for OCR and answering | Local models may vary in capability | Provide model abstraction and evaluation tests |
| Security model | Real auth may use enterprise SSO | Implement pluggable auth boundary, not hardcoded users |
| Delta-fetch definition | Could be based on created date, updated date, ingestion status, or fetch checkpoint | Implement configurable checkpoint model |
| Data retention policy | Documents may contain PII | Implement soft delete and audit logs in PoC |

---

## 5. Scope Discipline

### 5.1 In Scope

- Monorepo structure.
- Local Docker Compose environment.
- DMS API.
- DMS UI.
- MySQL metadata database.
- MongoDB GridFS PDF store.
- MySQL migrations and seed scripts.
- MongoDB initialization and indexes.
- Chatbot UI.
- Wrapper API.
- Master agent.
- Specialized agents.
- A2A protocol usage between master and specialized agents.
- MCP wrappers around DMS APIs.
- OCR and extraction pipeline.
- Vector ingestion into Qdrant.
- Answer generation from vector database.
- Health, readiness, logging, tracing, and metrics endpoints.
- Unit, integration, contract, API, E2E, A2A, and MCP tests.
- Demo fixtures and scripts.

### 5.2 Out of Scope

- Production SSO integration.
- Production DMS replacement.
- Production-grade document retention and legal hold.
- Human review workflow.
- Cloud deployment as the primary target.
- Advanced workflow engine.
- Multi-region architecture.
- Real enterprise secret manager integration.
- Full malware scanning platform.
- Full policy administration system integration.

### 5.3 Future Considerations

- Replace local auth with enterprise OIDC.
- Replace local Docker models with enterprise model gateway.
- Add malware scanning before PDF persistence.
- Add document classification models.
- Add human-in-the-loop review for low-confidence OCR.
- Add data lineage dashboards.
- Add Kubernetes manifests and Helm charts.
- Add production WAF and API gateway.

---

## 6. Architecture Rules

### 6.1 Boundary Rules

1. The DMS API owns DMS persistence.
2. The DMS UI must communicate only with the DMS API.
3. The chatbot UI must communicate only with the wrapper API.
4. The wrapper API must communicate with the agentic AI API or master agent API.
5. The master agent must communicate with specialized agents through A2A.
6. Specialized agents must access external tools through MCP.
7. MCP wrappers for documents must call DMS APIs, not databases.
8. No UI may connect directly to MySQL, MongoDB, or Qdrant.
9. No agent may directly connect to MySQL or MongoDB for current-state DMS operations.
10. Vector database content is derived and rebuildable, not the source of truth.
11. All cross-service contracts must be versioned under `/api/v1` or an equivalent version boundary.
12. All services must expose `/health/live`, `/health/ready`, and `/metrics` where applicable.

### 6.2 Simplicity Rules

1. Prefer the smallest implementation that proves the business flow.
2. Do not add abstractions unless two or more services need them immediately.
3. Do not introduce queues until synchronous flow is working and tested.
4. Do not introduce Kubernetes until Docker Compose works end to end.
5. Do not build a complex workflow engine for the PoC.
6. Do not add multiple vector stores.
7. Do not add multiple databases for metadata.
8. Do not implement speculative multi-tenant logic unless required by tests.

### 6.3 Data Ownership Rules

| Data | Owner | Storage | Access Pattern |
|---|---|---|---|
| PDF metadata | DMS API | MySQL | DMS REST API |
| PDF binary | DMS API | MongoDB GridFS | DMS REST API |
| Document handle ID | DMS API | MySQL | DMS REST API |
| Extracted text | OCR or ingestion pipeline | Local derived store or vector payload | Agent APIs |
| Embeddings | Ingestion agent | Qdrant | Vector service or answer agent |
| Chat sessions | Wrapper API or chatbot service | MySQL or local store | Wrapper API |
| Fetch checkpoints | Agentic AI API | MySQL or dedicated table | Agent APIs |
| Audit logs | Each service | Logs plus optional DB table | Observability tools |

---

## 7. Recommended Technology Standards

### 7.1 Runtime and Language

- Use TypeScript for all Node.js services and UIs.
- Use strict TypeScript mode.
- Use Node.js LTS runtime.
- Use `pnpm` workspaces for monorepo package management.
- Use ESM consistently unless an SDK forces CommonJS.

### 7.2 Backend Services

- Use Fastify for REST APIs.
- Use `@fastify/multipart` for PDF uploads.
- Use `@fastify/cors` with environment-driven allowed origins.
- Use `@fastify/helmet` where compatible.
- Use `@fastify/swagger` and `@fastify/swagger-ui` for API documentation.
- Use `@sinclair/typebox` or Zod for request and response validation.
- Use a shared error envelope across APIs.
- Use pino-compatible structured logging.

### 7.3 DMS Persistence

- Use MySQL for metadata.
- Use MongoDB GridFS for PDFs.
- Use Drizzle ORM or a lightweight migration tool for MySQL migrations.
- Use the official MongoDB Node.js driver for GridFS operations.
- Use application-level compensation for MySQL and MongoDB consistency because distributed transactions are unnecessary for the PoC.

### 7.4 AI and Agent Layer

- Use LangGraph.js for orchestration logic in the master agent.
- Use `@a2a-js/sdk` for agent-to-agent communication.
- Use `@modelcontextprotocol/sdk` for MCP servers and clients.
- Use local OpenAI-compatible model endpoints through environment variables.
- Use Qdrant for vector search.
- Use a dedicated embedding model. Do not rely on a chat-only model for embeddings unless explicitly verified.
- Maintain an environment-driven model catalog and expose it through the wrapper API for the chatbot UI.

#### 7.4.1 Local Model Catalog

The local Docker model catalog must include these model names as configurable options. Do not hardcode this list in React components or backend source code; define it in environment configuration and validate it at startup.

| Model name | Intended PoC use | UI dropdown eligibility | Notes |
|---|---|---|---|
| `ai/gpt-oss:latest` | General chat, reasoning, answer generation, and non-OCR agent functionality | Agent/functionality dropdown | Default general-purpose local agent model unless overridden. |
| `ai/ministral3:14B` | Small reasoning, routing support, and lower-latency agent functionality | Agent/functionality dropdown | Useful for lower-latency reasoning tests. |
| `ai/qwen3-vl:latest` | OCR, visual document understanding, scanned-PDF extraction | OCR dropdown | Default OCR/VLM model unless overridden. |
| `ai/gemma4:latest` | Fallback chat and answer generation | Agent/functionality dropdown | Existing fallback model. |
| `ai/gemma4:31B` | Larger Gemma chat, answer generation, and agent functionality option | Agent/functionality dropdown | Must be available as a selectable agent/functionality model when configured. |
| `ai/mxbai-embed-large:latest` or `ai/nomic-embed-text-v1.5` | Embeddings | No | Embedding models must not appear in either user-facing dropdown. |

Model capability rules:

1. Chatbot users must have two independent model dropdowns.
2. The OCR model dropdown may contain only models with OCR, VLM, vision, or document-extraction capability and that are enabled in the OCR allowlist.
3. The agent/functionality model dropdown may contain only models with chat, reasoning, answer, or agent capability and that are enabled in the agent allowlist.
4. The selected OCR model controls OCR-agent visual extraction and scanned-PDF extraction.
5. The selected agent/functionality model controls answer generation and all model-powered non-OCR agent behavior that supports model override.
6. Embedding models remain system-controlled and must never appear in either user-facing dropdown.
7. The backend must reject unknown, disabled, or category-disallowed model names even if the UI is bypassed.
8. The same physical model may appear in both dropdowns only when the model catalog explicitly declares both capability sets and both allowlists permit it.
9. The UI must display friendly model labels while submitting exact configured model names to the wrapper API.
10. Model-powered routing, sufficiency checks, and answer generation must make real calls to the configured OpenAI-compatible model endpoint. Hardcoded keyword branches, regex summaries, canned responses, or substring-only answers are not acceptable outside isolated unit-test mocks.

### 7.5 UI Standards

- Use React, TypeScript, Vite, TanStack Router, and TanStack Query.
- Use TanStack Form or a simple typed form approach for upload and metadata forms.
- Keep the DMS UI separate from the chatbot UI.
- Both UIs must be configured through environment variables.
- Use generated or shared API client types where practical.

### 7.6 Testing Standards

- Use Vitest for unit tests.
- Use Supertest or Fastify inject for API tests.
- Use Playwright for UI and E2E tests.
- Use Docker Compose services for integration tests.
- Use contract tests for DMS API, MCP tools, and A2A agents.

---

## 8. Required Repository Structure

Implement the repository with this structure unless an ADR changes it.

```text
.
├── apps/
│   ├── chatbot-ui/
│   │   ├── src/
│   │   ├── public/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── dms-ui/
│       ├── src/
│       │   ├── components/
│       │   ├── routes/
│       │   ├── lib/
│       │   ├── api/
│       │   └── main.tsx
│       ├── public/
│       ├── tests/
│       ├── Dockerfile
│       └── package.json
├── services/
│   ├── dms-api/
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── config.ts
│   │   │   ├── routes/
│   │   │   ├── repositories/
│   │   │   ├── services/
│   │   │   ├── schemas/
│   │   │   ├── plugins/
│   │   │   ├── errors/
│   │   │   └── observability/
│   │   ├── migrations/
│   │   ├── seeds/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── wrapper-api/
│   ├── agentic-ai-api/
│   └── vector-service/
├── agents/
│   ├── master-agent/
│   ├── metadata-agent/
│   ├── fetch-document-agent/
│   ├── ocr-agent/
│   ├── vector-ingestion-agent/
│   └── answer-agent/
├── mcp-servers/
│   ├── dms-query-mcp/
│   ├── dms-fetch-mcp/
│   └── vector-mcp/
├── packages/
│   ├── config/
│   ├── logger/
│   ├── api-contracts/
│   ├── errors/
│   ├── auth/
│   ├── db-mysql/
│   ├── db-mongo/
│   ├── a2a-common/
│   ├── mcp-common/
│   ├── model-client/
│   └── test-utils/
├── infra/
│   ├── docker/
│   ├── docker-compose.yml
│   ├── mysql/
│   │   └── init/
│   ├── mongodb/
│   │   └── init/
│   ├── qdrant/
│   └── k8s/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── adr/
│   └── runbooks/
├── scripts/
│   ├── dev-up.sh
│   ├── dev-down.sh
│   ├── seed-dms.sh
│   ├── smoke-test.sh
│   └── reset-local-data.sh
├── data/
│   ├── fixtures/
│   │   ├── pdfs/
│   │   └── metadata/
│   └── generated/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── performance/
│   └── security/
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
└── INSTRUCTION.md
```

---

## 9. DMS API Implementation Instructions

### 9.1 Objective

Build the DMS API as the local recreation of the current document management system.

It must provide upload, query, metadata lookup, and PDF fetch behavior. It must be the only service that directly writes to or reads from the DMS MySQL and MongoDB stores.

### 9.2 Required Endpoints

All DMS API endpoints must be versioned under `/api/v1`.

#### 9.2.1 Upload Document

```http
POST /api/v1/documents
Content-Type: multipart/form-data
```

Required multipart fields:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `file` | PDF file | Yes | Must be application/pdf or validated as PDF binary |
| `policyNumber` | string | Yes | Indexed in MySQL |
| `documentType` | string | Yes | Example: `POLICY_DOCUMENT`, `BENEFICIARY_DOCUMENT` |
| `customerId` | string | No | Indexed if provided |
| `beneficiaryId` | string | No | Indexed if provided |
| `documentDate` | ISO date | No | Business document date |
| `effectiveDate` | ISO date | No | Policy effective date |
| `sourceSystem` | string | No | Default `LOCAL_DMS_UI` |
| `tags` | JSON array or comma-separated string | No | Normalize to string array |
| `metadata` | JSON object | No | Additional metadata |

Successful response:

```json
{
  "handleId": "doc_01HZYEXAMPLE000000000000",
  "policyNumber": "POL-10001",
  "documentType": "POLICY_DOCUMENT",
  "fileName": "policy.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 123456,
  "contentHashSha256": "...",
  "status": "ACTIVE",
  "createdAt": "2026-06-06T00:00:00.000Z"
}
```

Implementation rules:

1. Validate file type and file size before persistence.
2. Generate `handleId` in the DMS API, not in the UI.
3. Use a stable, sortable ID such as ULID with prefix `doc_`.
4. Compute SHA-256 content hash while streaming or before storage.
5. Store the PDF in MongoDB GridFS.
6. Store metadata and the MongoDB GridFS file ID in MySQL.
7. If MySQL persistence fails after MongoDB upload, delete the MongoDB file as compensation.
8. If MongoDB upload fails, do not insert MySQL metadata.
9. Return a consistent error envelope.
10. Write an audit log event for upload attempts and successful uploads.

#### 9.2.2 Query Documents

```http
GET /api/v1/documents
```

Supported query parameters:

| Parameter | Type | Required | Notes |
|---|---|---:|---|
| `policyNumber` | string | No | Exact match for PoC |
| `documentType` | string | No | Exact match |
| `customerId` | string | No | Exact match |
| `beneficiaryId` | string | No | Exact match |
| `sourceSystem` | string | No | Exact match |
| `updatedAfter` | ISO datetime | No | Required for delta fetch |
| `createdAfter` | ISO datetime | No | Optional delta query |
| `limit` | number | No | Default 25, max 100 |
| `cursor` | string | No | Cursor pagination |
| `includeDeleted` | boolean | No | Default false |

Successful response:

```json
{
  "items": [
    {
      "handleId": "doc_01HZYEXAMPLE000000000000",
      "policyNumber": "POL-10001",
      "documentType": "POLICY_DOCUMENT",
      "customerId": "CUST-10001",
      "beneficiaryId": "BEN-10001",
      "fileName": "policy.pdf",
      "contentType": "application/pdf",
      "sizeBytes": 123456,
      "contentHashSha256": "...",
      "documentDate": "2026-01-15",
      "effectiveDate": "2026-01-01",
      "sourceSystem": "LOCAL_DMS_UI",
      "tags": ["demo"],
      "metadata": {},
      "status": "ACTIVE",
      "createdAt": "2026-06-06T00:00:00.000Z",
      "updatedAt": "2026-06-06T00:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Implementation rules:

1. Never return PDF binary from the query endpoint.
2. Return handle IDs and metadata only.
3. Implement pagination from the first version.
4. Add indexes for common metadata filters.
5. Support `updatedAfter` to enable latest/delta fetch.
6. Validate all query parameters.

#### 9.2.3 Get Document Metadata by Handle ID

```http
GET /api/v1/documents/:handleId/metadata
```

Implementation rules:

1. Return metadata only.
2. Return 404 if the handle ID does not exist or is deleted.
3. Include enough metadata for answer citation and ingestion decisions.

#### 9.2.4 Fetch PDF by Handle ID

```http
GET /api/v1/documents/:handleId/content
```

Implementation rules:

1. Return `application/pdf`.
2. Stream the PDF from MongoDB GridFS.
3. Do not load large files fully into memory.
4. Set `Content-Disposition` with the original file name.
5. Set `X-Document-Handle-Id` response header.
6. Set `X-Content-Hash-Sha256` response header.
7. Return 404 for missing documents.
8. Return 410 for soft-deleted documents if using deleted status.
9. Write an audit log event for successful fetches.

#### 9.2.5 Soft Delete Document

```http
DELETE /api/v1/documents/:handleId
```

Implementation rules:

1. Soft delete in MySQL by setting `deletedAt` and status.
2. Do not physically delete the MongoDB PDF by default.
3. Add a future cleanup script if physical deletion is required.
4. Return 204 on success.

#### 9.2.6 DMS Health Endpoints

```http
GET /health/live
GET /health/ready
GET /metrics
```

Readiness must verify:

- MySQL connectivity.
- MongoDB connectivity.
- Required collections or GridFS bucket availability.

### 9.3 DMS Error Envelope

All DMS API errors must use this structure:

```json
{
  "error": {
    "code": "DMS_VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {},
    "requestId": "req_..."
  }
}
```

Do not return stack traces to clients.

---

## 10. DMS Database Implementation Instructions

### 10.1 MySQL Metadata Schema

Create a migration for the `documents` table.

Required columns:

```sql
CREATE TABLE documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  handle_id VARCHAR(64) NOT NULL UNIQUE,
  policy_number VARCHAR(128) NOT NULL,
  document_type VARCHAR(128) NOT NULL,
  customer_id VARCHAR(128) NULL,
  beneficiary_id VARCHAR(128) NULL,
  file_name VARCHAR(512) NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  content_hash_sha256 CHAR(64) NOT NULL,
  mongo_file_id VARCHAR(128) NOT NULL,
  mongo_bucket VARCHAR(128) NOT NULL DEFAULT 'dms_documents',
  document_date DATE NULL,
  effective_date DATE NULL,
  source_system VARCHAR(128) NOT NULL DEFAULT 'LOCAL_DMS_UI',
  tags JSON NULL,
  metadata JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  INDEX idx_documents_policy_number (policy_number),
  INDEX idx_documents_document_type (document_type),
  INDEX idx_documents_customer_id (customer_id),
  INDEX idx_documents_beneficiary_id (beneficiary_id),
  INDEX idx_documents_updated_at (updated_at),
  INDEX idx_documents_created_at (created_at),
  INDEX idx_documents_content_hash (content_hash_sha256),
  INDEX idx_documents_policy_type_updated (policy_number, document_type, updated_at)
);
```

Create an `document_audit_events` table.

```sql
CREATE TABLE document_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL UNIQUE,
  handle_id VARCHAR(64) NULL,
  event_type VARCHAR(128) NOT NULL,
  actor_id VARCHAR(128) NULL,
  actor_type VARCHAR(64) NULL,
  request_id VARCHAR(128) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  outcome VARCHAR(32) NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_handle_id (handle_id),
  INDEX idx_audit_event_type (event_type),
  INDEX idx_audit_created_at (created_at)
);
```

Create an optional `ingestion_checkpoints` table for delta fetch behavior.

```sql
CREATE TABLE ingestion_checkpoints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  checkpoint_name VARCHAR(128) NOT NULL UNIQUE,
  scope_key VARCHAR(256) NULL,
  last_successful_fetch_at TIMESTAMP(3) NULL,
  last_successful_ingestion_at TIMESTAMP(3) NULL,
  last_cursor VARCHAR(512) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
```

### 10.2 MongoDB GridFS Rules

Use a GridFS bucket named `dms_documents` unless overridden by environment variable.

Store file metadata in GridFS with this structure:

```json
{
  "handleId": "doc_...",
  "policyNumber": "POL-10001",
  "documentType": "POLICY_DOCUMENT",
  "contentHashSha256": "...",
  "uploadedBy": "local-user",
  "sourceSystem": "LOCAL_DMS_UI"
}
```

Required indexes:

```javascript
db.dms_documents.files.createIndex({ "metadata.handleId": 1 }, { unique: true });
db.dms_documents.files.createIndex({ "metadata.policyNumber": 1 });
db.dms_documents.files.createIndex({ "metadata.documentType": 1 });
db.dms_documents.files.createIndex({ uploadDate: 1 });
```

### 10.3 Consistency Rules

1. MongoDB and MySQL are not in a distributed transaction.
2. Upload flow must use compensation.
3. If MongoDB succeeds and MySQL fails, delete the MongoDB GridFS object.
4. If MySQL succeeds and response fails, retry queries must still show the document.
5. Use content hash and optional idempotency key to avoid duplicate upload behavior.
6. Do not store PDF bytes in MySQL.
7. Do not store full PDF text in MySQL unless a future ADR allows it.

### 10.4 Seed Data

Provide seed scripts that create:

- At least 5 policy documents.
- At least 5 beneficiary documents.
- At least 2 policies with multiple documents.
- At least 1 scanned-image PDF fixture.
- At least 1 searchable-text PDF fixture.
- At least 1 updated document for delta-fetch testing.

Seed scripts must call the DMS API upload endpoint where possible. Do not bypass the DMS API unless seeding infrastructure itself is under test.

---

## 11. DMS UI Implementation Instructions

### 11.1 Objective

Build a DMS UI that proves the recreated current-state system is usable without the chatbot.

The DMS UI must let a user:

1. Upload a PDF with metadata.
2. View the generated handle ID.
3. Search documents by metadata.
4. View metadata details.
5. Download or open the PDF by handle ID.
6. Validate that DMS APIs are working independently of the AI layer.

### 11.2 Required Routes

Implement these routes in `apps/dms-ui`.

| Route | Purpose |
|---|---|
| `/` | DMS dashboard with links and API status |
| `/upload` | Upload PDF and metadata |
| `/documents` | Search and filter documents |
| `/documents/$handleId` | Document metadata detail |
| `/documents/$handleId/view` | PDF viewer or download page |
| `/health` | UI-level health or configuration diagnostics |

### 11.3 Upload Page Requirements

The upload page must include:

- PDF file picker.
- Policy number input.
- Document type select.
- Customer ID input.
- Beneficiary ID input.
- Document date input.
- Effective date input.
- Source system input with default `LOCAL_DMS_UI`.
- Tags input.
- Additional metadata JSON textarea or key-value editor.
- Upload button.
- Client-side validation.
- Server-side error display.
- Success panel showing handle ID, content hash, file size, and created time.

Client-side validation rules:

1. File is required.
2. File extension must be `.pdf`.
3. Policy number is required.
4. Document type is required.
5. Metadata JSON must be valid JSON if provided.
6. File size must be under `VITE_DMS_MAX_UPLOAD_MB` when configured.

### 11.4 Search Page Requirements

The search page must include filters for:

- Policy number.
- Document type.
- Customer ID.
- Beneficiary ID.
- Updated after.
- Created after.

The results table must show:

- Handle ID.
- Policy number.
- Document type.
- Customer ID.
- Beneficiary ID.
- File name.
- Size.
- Created at.
- Updated at.
- Actions: details, view PDF, download PDF.

### 11.5 Document Detail Page Requirements

The detail page must show:

- All metadata returned by the DMS API.
- Handle ID copy button.
- Download PDF button.
- Link to PDF viewer route.
- Audit-friendly metadata such as created and updated timestamps.

### 11.6 UI API Client Rules

1. All DMS UI API calls must go through a typed API client under `apps/dms-ui/src/api`.
2. Base URL must come from `VITE_DMS_API_BASE_URL`.
3. Do not hardcode API URLs.
4. Do not hardcode credentials.
5. Use TanStack Query for remote data fetching and caching.
6. Upload must use `FormData` and the DMS API multipart endpoint.
7. Show request failures with the DMS error envelope message.
8. Add loading and disabled states to upload and search actions.
9. Do not log PDF binary or PII metadata to the browser console.

### 11.7 DMS UI Definition of Done

The DMS UI is complete when:

1. A user can upload a PDF successfully.
2. The upload result shows a generated handle ID.
3. The uploaded document appears in metadata search results.
4. The user can open document details by handle ID.
5. The user can download or view the PDF from the DMS API.
6. Refreshing the browser does not lose uploaded data because data is persisted in MySQL and MongoDB.
7. Playwright E2E tests cover upload, search, detail, and download flows.

---

## 12. Chatbot UI Implementation Instructions

### 12.1 Objective

Build the chatbot UI separately from the DMS UI.

The chatbot UI must prove the future-state user experience:

1. User asks a question.
2. UI asks whether to fetch minimum documents or all documents.
3. UI asks whether to fetch latest or use existing indexed content.
4. UI shows two model-selection dropdowns populated from the wrapper API model catalog: OCR model and agent/functionality model.
5. User selects the OCR model to use for document extraction when OCR is needed.
6. User selects the agent/functionality model to use for the rest of the agentic flow, including answer generation and model-powered reasoning.
7. UI sends the final request to the wrapper API, including both selected model names.
8. UI displays the answer, citations, source handle IDs, selected OCR model, actual OCR model used, selected agent model, actual agent model used, route taken, and whether additional DMS fetch occurred.

### 12.2 Chat Request Shape

Use this logical request shape:

```json
{
  "question": "What is the beneficiary listed on policy POL-10001?",
  "policyNumber": "POL-10001",
  "documentFetchMode": "MINIMUM",
  "freshnessMode": "DELTA_ONLY",
  "selectedOcrModelName": "ai/qwen3-vl:latest",
  "selectedAgentModelName": "ai/gemma4:31B",
  "sessionId": "chat_..."
}
```

Allowed `documentFetchMode` values:

- `MINIMUM`
- `ALL`

Allowed `freshnessMode` values:

- `VECTOR_ONLY`
- `DELTA_ONLY`
- `FETCH_LATEST`

Allowed `selectedOcrModelName` values must come from the OCR model section of `GET /api/v1/models` and the backend OCR allowlist. The initial OCR allowlist must include `ai/qwen3-vl:latest`.

Allowed `selectedAgentModelName` values must come from the agent/functionality model section of `GET /api/v1/models` and the backend agent allowlist. The initial agent allowlist must include `ai/gpt-oss:latest`, `ai/ministral3:14B`, `ai/gemma4:latest`, and `ai/gemma4:31B`.

Do not allow arbitrary user-supplied model names for either field.

### 12.3 Chat Response Shape

```json
{
  "answer": "...",
  "confidence": 0.83,
  "selectedOcrModelName": "ai/qwen3-vl:latest",
  "ocrModelUsedName": "ai/qwen3-vl:latest",
  "selectedAgentModelName": "ai/gemma4:31B",
  "agentModelUsedName": "ai/gemma4:31B",
  "citations": [
    {
      "handleId": "doc_...",
      "policyNumber": "POL-10001",
      "documentType": "POLICY_DOCUMENT",
      "pageNumber": 2,
      "excerpt": "..."
    }
  ],
  "route": {
    "vectorCheckedFirst": true,
    "dmsQueryCalled": true,
    "documentsFetched": 1,
    "ocrPerformed": true,
    "vectorIngestionPerformed": true
  },
  "warnings": []
}
```

### 12.4 Dual Model Selection Dropdown Requirements

The chatbot UI must include two independent model-selection dropdowns:

1. **OCR model dropdown** for OCR, VLM, scanned-PDF extraction, and document visual understanding.
2. **Agent/functionality model dropdown** for the rest of the agentic flow, including answer generation, routing support, and model-powered reasoning.

Required behavior:

1. On page load, call `GET /api/v1/models` on the wrapper API.
2. Populate the OCR dropdown from the returned OCR model catalog only.
3. Populate the agent/functionality dropdown from the returned agent model catalog only.
4. Select the API-provided default OCR model automatically.
5. Select the API-provided default agent/functionality model automatically.
6. Include `ai/qwen3-vl:latest` as a selectable OCR option when present in the OCR allowlist.
7. Include `ai/gemma4:31B` as a selectable agent/functionality option when present in the agent allowlist.
8. Submit the selected OCR value as `selectedOcrModelName` in `POST /api/v1/chat/question`.
9. Submit the selected agent/functionality value as `selectedAgentModelName` in `POST /api/v1/chat/question`.
10. Display selected and actual OCR model names in the answer panel and route trace when OCR was performed.
11. Display selected and actual agent/functionality model names in the answer panel and route trace for every answer.
12. Preserve both selected models within the chat session until the user changes either value.
13. Handle model-list load failure by displaying a clear UI error and disabling question submission, rather than silently using hardcoded models.

Required model catalog response shape:

```json
{
  "defaults": {
    "ocrModelName": "ai/qwen3-vl:latest",
    "agentModelName": "ai/gpt-oss:latest"
  },
  "dropdowns": {
    "ocr": {
      "label": "OCR model",
      "allowedCapabilities": ["ocr", "vision", "vlm", "document_extraction"],
      "models": [
        {
          "name": "ai/qwen3-vl:latest",
          "label": "Qwen 3 VL Latest",
          "capabilities": ["ocr", "vision", "vlm", "document_extraction"],
          "enabled": true
        }
      ]
    },
    "agent": {
      "label": "Agent and answer model",
      "allowedCapabilities": ["chat", "reasoning", "answer", "agent"],
      "models": [
        {
          "name": "ai/gpt-oss:latest",
          "label": "GPT OSS Latest",
          "capabilities": ["chat", "reasoning", "answer", "agent"],
          "enabled": true
        },
        {
          "name": "ai/ministral3:14B",
          "label": "Ministral 3 14B",
          "capabilities": ["chat", "reasoning", "answer", "agent"],
          "enabled": true
        },
        {
          "name": "ai/gemma4:latest",
          "label": "Gemma 4 Latest",
          "capabilities": ["chat", "answer", "agent"],
          "enabled": true
        },
        {
          "name": "ai/gemma4:31B",
          "label": "Gemma 4 31B",
          "capabilities": ["chat", "answer", "agent"],
          "enabled": true
        }
      ]
    }
  },
  "models": [
    {
      "name": "ai/qwen3-vl:latest",
      "label": "Qwen 3 VL Latest",
      "capabilities": ["ocr", "vision", "vlm", "document_extraction"],
      "dropdowns": ["ocr"],
      "enabled": true
    },
    {
      "name": "ai/gpt-oss:latest",
      "label": "GPT OSS Latest",
      "capabilities": ["chat", "reasoning", "answer", "agent"],
      "dropdowns": ["agent"],
      "enabled": true
    },
    {
      "name": "ai/ministral3:14B",
      "label": "Ministral 3 14B",
      "capabilities": ["chat", "reasoning", "answer", "agent"],
      "dropdowns": ["agent"],
      "enabled": true
    },
    {
      "name": "ai/gemma4:latest",
      "label": "Gemma 4 Latest",
      "capabilities": ["chat", "answer", "agent"],
      "dropdowns": ["agent"],
      "enabled": true
    },
    {
      "name": "ai/gemma4:31B",
      "label": "Gemma 4 31B",
      "capabilities": ["chat", "answer", "agent"],
      "dropdowns": ["agent"],
      "enabled": true
    }
  ]
}
```

Implementation rules:

1. Each dropdown must filter out disabled models unless a debug flag explicitly shows unavailable options.
2. The OCR dropdown must include only models listed under `dropdowns.ocr.models`.
3. The agent/functionality dropdown must include only models listed under `dropdowns.agent.models`.
4. Neither dropdown may show embedding-only models.
5. The UI must not infer capabilities from model-name text; it must use the API-provided capabilities and dropdown membership.
6. The wrapper API must validate `selectedOcrModelName` against the OCR allowlist returned by `GET /api/v1/models`.
7. The wrapper API must validate `selectedAgentModelName` against the agent allowlist returned by `GET /api/v1/models`.
8. The master agent must receive both selected model names in its typed request context.
9. The OCR agent must receive the selected OCR model in its typed request context when OCR is required.
10. The answer agent and any model-powered non-OCR agent must receive the selected agent/functionality model in their typed request context.

---

## 13. Wrapper API Implementation Instructions

### 13.1 Responsibilities

The wrapper API must:

1. Expose a clean REST API to chatbot UI.
2. Validate chatbot requests.
3. Validate `selectedOcrModelName` against the configured allowed OCR model list.
4. Validate `selectedAgentModelName` against the configured allowed agent/functionality model list.
5. Add request ID, actor context, selected OCR model context, and selected agent/functionality model context.
6. Call the master agent or agentic AI API.
7. Normalize errors for the UI.
8. Expose the model catalog needed by both chatbot dropdowns.
9. Avoid containing orchestration business logic that belongs in the master agent.

### 13.2 Required Endpoints

```http
POST /api/v1/chat/question
GET /api/v1/chat/sessions/:sessionId
GET /api/v1/models
GET /health/live
GET /health/ready
GET /metrics
```

### 13.3 Rules

1. Do not call the DMS API directly from the wrapper API unless implementing a diagnostic endpoint explicitly marked as non-production PoC tooling.
2. Do not read or write vector data directly unless through a defined vector service contract.
3. Do not bypass the master agent.
4. Do not accept arbitrary OCR or agent/functionality model names from the UI.
5. Do not hardcode either model dropdown list in the UI; the wrapper API is the source for UI-selectable models.
6. Reject `selectedOcrModelName` when it is not enabled in the OCR dropdown catalog.
7. Reject `selectedAgentModelName` when it is not enabled in the agent/functionality dropdown catalog.
8. Reject valid model names submitted to the wrong field, such as an agent-only model in `selectedOcrModelName` or an OCR-only model in `selectedAgentModelName`.
9. Return validation errors that identify which model field is invalid without exposing internal configuration details.

---

## 14. Agentic AI and Specialized Agent Instructions

### 14.1 Master Agent

The master agent is responsible for planning and routing.

Required behavior:

1. Always check vector database first.
2. Determine whether the vector database contains content for the requested policy number.
3. Determine whether existing indexed content is sufficient to answer the question.
4. Respect user preference for minimum documents versus all documents.
5. Respect user preference for latest or delta-only fetching.
6. Respect the selected agent/functionality model for answer generation and model-powered non-OCR decisions when the selected model is allowed and available.
7. Use the selected agent/functionality model through `MODEL_BASE_URL` for model-powered retrieval planning, including whether retrieved vector chunks are sufficient and whether DMS metadata/PDF fetch is needed.
8. Parse model retrieval-planning output as a typed decision object and fail clearly when the model response is malformed.
9. Preserve hard user constraints: `vector-only` must not fetch DMS content, and `latest` must fetch latest DMS content even when existing vector chunks look answerable.
10. Pass the selected OCR model to the OCR agent when OCR or visual document extraction is needed.
11. Track and return the actual OCR model reported by the OCR agent, not only the selected OCR model.
12. Use A2A to call metadata agent when DMS metadata is needed.
13. Use A2A to call fetch-document agent when PDFs are needed.
14. Use A2A to call OCR agent when fetched PDFs require extraction.
15. Use A2A to call vector ingestion agent when extracted text must be indexed.
16. Use A2A to call answer agent for final answer generation.
17. Return route details for transparency, including a model-planning step when an LLM made the routing/sufficiency decision.
18. Never directly call MySQL or MongoDB.
19. Never directly fetch PDFs from MongoDB.
20. Never fabricate citations.
21. Do not replace model-powered retrieval planning with keyword-only, empty-result-only, or hardcoded routing logic.

Required LangGraph nodes:

- `parse_question`
- `extract_policy_context`
- `check_vector_coverage`
- `decide_fetch_strategy`
- `query_dms_metadata`
- `select_documents`
- `fetch_documents`
- `ocr_documents`
- `ingest_vectors`
- `answer_question`
- `finalize_response`

### 14.2 Metadata Agent

Responsibilities:

1. Expose A2A endpoint.
2. Receive metadata query intent from master agent.
3. Call DMS Query MCP tool.
4. Return handle IDs and metadata.
5. Support filtering by policy number, document type, customer ID, beneficiary ID, and updated-after timestamp.

Rules:

1. Must not call DMS API directly if MCP wrapper is available.
2. Must not fetch PDF content.
3. Must not perform answer generation.

### 14.3 Fetch Document Agent

Responsibilities:

1. Expose A2A endpoint.
2. Receive selected handle IDs from master agent.
3. Call DMS Fetch MCP tool.
4. Return document bytes or a local temporary file reference according to the agreed contract.
5. Validate content hash when available.

Rules:

1. Must not query metadata except for fetch validation.
2. Must not OCR documents.
3. Must not write to vector database.

### 14.4 OCR Agent

Responsibilities:

1. Expose A2A endpoint.
2. Accept PDF content or local file references.
3. Extract text, page structure, and document-level metadata.
4. Receive and validate the selected OCR model from the master agent.
5. Use the selected OCR/VLM model where needed for OCR, scanned-PDF extraction, and visual document understanding.
6. Fall back only to the configured fallback OCR model when the selected OCR model is unavailable, and include a warning that fallback occurred.
7. Return structured extraction results by page.
8. Include confidence where available.

Rules:

1. Must not call DMS APIs.
2. Must not write to Qdrant directly unless explicitly combined with ingestion by ADR.
3. Must not answer user questions.
4. Must not execute or proxy arbitrary OCR model names.
5. Must preserve handle ID and page numbers for citations.
6. Must record the effective OCR model name in logs and response metadata.

### 14.5 Vector Ingestion Agent

Responsibilities:

1. Expose A2A endpoint.
2. Chunk extracted text.
3. Generate embeddings through configured model endpoint.
4. Write vectors to Qdrant.
5. Store payload metadata required for citations.
6. Implement idempotent ingestion using content hash and handle ID.

Vector payload must include:

```json
{
  "handleId": "doc_...",
  "policyNumber": "POL-10001",
  "documentType": "POLICY_DOCUMENT",
  "pageNumber": 1,
  "chunkIndex": 0,
  "contentHashSha256": "...",
  "sourceSystem": "LOCAL_DMS_UI",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Rules:

1. Must not fetch documents from DMS.
2. Must not answer questions.
3. Must avoid duplicate chunks for the same handle ID, page number, chunk index, and content hash.

### 14.6 Answer Agent

Responsibilities:

1. Expose A2A endpoint.
2. Retrieve relevant chunks from Qdrant or receive retrieved chunks from master agent.
3. Receive the validated `selectedAgentModelName` from the master agent.
4. Generate the grounded answer by calling the configured OpenAI-compatible chat completions endpoint at `MODEL_BASE_URL` with the selected agent/functionality model.
5. Fall back only to the configured fallback agent model when the selected model is unavailable, and include a warning that fallback occurred.
6. Return citations tied to handle IDs and page numbers.
7. State when answer confidence is low.
8. State when more documents are required.

Rules:

1. Must not fabricate citations.
2. Must not call DMS API.
3. Must not claim information exists unless supported by retrieved chunks.
4. Must not execute or proxy arbitrary model names.
5. Must record the effective agent/functionality model name in logs and response metadata.
6. Must not produce answers with regex extraction, static templates, canned prose, or raw chunk slicing except in test doubles.
7. Must fail with a typed upstream/model error when the configured model endpoint cannot return assistant content.

---

## 15. MCP Server Instructions

### 15.1 DMS Query MCP

Expose a tool named `queryDocuments`.

Input schema:

```json
{
  "policyNumber": "string optional",
  "documentType": "string optional",
  "customerId": "string optional",
  "beneficiaryId": "string optional",
  "updatedAfter": "string optional ISO datetime",
  "limit": "number optional",
  "cursor": "string optional"
}
```

Output schema must match the DMS Query Documents API response.

Rules:

1. Call `DMS_API_BASE_URL` through HTTP.
2. Use `DMS_API_KEY` or configured auth.
3. Do not connect to MySQL.
4. Do not connect to MongoDB.
5. Preserve request IDs.

### 15.2 DMS Fetch MCP

Expose a tool named `fetchDocumentContent`.

Input schema:

```json
{
  "handleId": "doc_..."
}
```

Output must include:

- Handle ID.
- Content type.
- File name.
- Size bytes.
- Content hash.
- PDF bytes as base64 or a temporary file reference.

Rules:

1. Call the DMS Fetch Document API.
2. Do not connect to MongoDB directly.
3. Enforce max file size.
4. Return clear errors for missing or deleted documents.

### 15.3 Vector MCP

Expose tools as needed:

- `searchPolicyVectors`
- `getVectorCoverage`
- `upsertDocumentChunks`

Rules:

1. Keep vector operations separate from DMS source-of-truth operations.
2. Payload metadata must preserve source handle IDs.
3. Search results must include enough metadata for citations.

---

## 16. A2A Implementation Instructions

Every specialized agent must be testable over A2A and through a local diagnostic REST endpoint.

Required for each agent:

```http
GET /health/live
GET /health/ready
GET /metrics
GET /agent-card
POST /a2a
POST /api/v1/invoke
```

Rules:

1. `/agent-card` must describe capabilities, input schema, output schema, and version.
2. `/a2a` must be the primary agent-to-agent protocol endpoint.
3. `/api/v1/invoke` exists for independent local testing only.
4. Agent behavior through `/a2a` and `/api/v1/invoke` must be equivalent.
5. All agent requests must include or generate a request ID.
6. Agents must return typed errors.
7. Agents must not call services outside their responsibility boundary.

---

## 17. Environment and Configuration Rules

### 17.1 Global Rules

1. Never hardcode URLs.
2. Never hardcode credentials.
3. Never hardcode model names.
4. Never hardcode ports in source code.
5. All configuration must be environment driven.
6. Validate environment variables at service startup.
7. Fail fast when required configuration is missing.
8. Provide safe local defaults only in `.env.example` and Docker Compose.
9. Do not commit real secrets.

### 17.2 Required Root `.env.example`

```bash
# Runtime
NODE_ENV=development
LOG_LEVEL=debug
REQUEST_ID_HEADER=x-request-id

# Ports
DMS_API_PORT=3101
DMS_UI_PORT=3102
CHATBOT_UI_PORT=3000
WRAPPER_API_PORT=3200
MASTER_AGENT_PORT=3300
METADATA_AGENT_PORT=3301
FETCH_DOCUMENT_AGENT_PORT=3302
OCR_AGENT_PORT=3303
VECTOR_INGESTION_AGENT_PORT=3304
ANSWER_AGENT_PORT=3305
DMS_QUERY_MCP_PORT=3401
DMS_FETCH_MCP_PORT=3402
VECTOR_MCP_PORT=3403
QDRANT_PORT=6333
MYSQL_PORT=3306
MONGODB_PORT=27017

# UI URLs
VITE_DMS_API_BASE_URL=http://localhost:3101
VITE_WRAPPER_API_BASE_URL=http://localhost:3200
VITE_DMS_MAX_UPLOAD_MB=25
VITE_ENABLE_OCR_MODEL_SELECTION=true
VITE_ENABLE_AGENT_MODEL_SELECTION=true

# DMS API
DMS_API_BASE_URL=http://dms-api:3101
DMS_API_KEY=local-dev-dms-api-key
DMS_MAX_UPLOAD_MB=25
DMS_ALLOWED_MIME_TYPES=application/pdf
DMS_GRIDFS_BUCKET=dms_documents
DMS_HANDLE_PREFIX=doc_

# MySQL
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=document_ai_poc
MYSQL_USER=document_ai
MYSQL_PASSWORD=document_ai_password
MYSQL_ROOT_PASSWORD=root_password
MYSQL_SSL=false

# MongoDB
MONGODB_URI=mongodb://mongodb:27017
MONGODB_DATABASE=document_ai_poc
MONGODB_GRIDFS_BUCKET=dms_documents

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=document_chunks

# Model Endpoint
MODEL_BASE_URL=http://host.docker.internal:12434/engines/v1
MODEL_API_KEY=
MODEL_AVAILABLE_NAMES=ai/gpt-oss:latest,ai/ministral3:14B,ai/qwen3-vl:latest,ai/gemma4:latest,ai/gemma4:31B,ai/mxbai-embed-large:latest

# User-selectable model allowlists
MODEL_DEFAULT_OCR_NAME=ai/qwen3-vl:latest
MODEL_ALLOWED_OCR_NAMES=ai/qwen3-vl:latest
MODEL_DEFAULT_AGENT_NAME=ai/gpt-oss:latest
MODEL_ALLOWED_AGENT_NAMES=ai/gpt-oss:latest,ai/ministral3:14B,ai/gemma4:latest,ai/gemma4:31B

# System-controlled models
MODEL_EMBEDDING_NAME=ai/mxbai-embed-large:latest
MODEL_SMALL_REASONING_NAME=ai/ministral3:14B
MODEL_FALLBACK_AGENT_NAME=ai/gemma4:latest
MODEL_FALLBACK_OCR_NAME=ai/qwen3-vl:latest
MODEL_LARGE_GEMMA_NAME=ai/gemma4:31B
MODEL_ALLOW_FALLBACK=true

# Agent URLs
MASTER_AGENT_URL=http://master-agent:3300
METADATA_AGENT_URL=http://metadata-agent:3301
FETCH_DOCUMENT_AGENT_URL=http://fetch-document-agent:3302
OCR_AGENT_URL=http://ocr-agent:3303
VECTOR_INGESTION_AGENT_URL=http://vector-ingestion-agent:3304
ANSWER_AGENT_URL=http://answer-agent:3305

# MCP URLs
DMS_QUERY_MCP_URL=http://dms-query-mcp:3401
DMS_FETCH_MCP_URL=http://dms-fetch-mcp:3402
VECTOR_MCP_URL=http://vector-mcp:3403

# Auth - local PoC only
AUTH_MODE=local-api-key
INTERNAL_API_KEY=local-dev-internal-key
JWT_ISSUER=document-ai-poc
JWT_AUDIENCE=document-ai-poc-local
JWT_SECRET=local-dev-jwt-secret-change-me

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3102
```

### 17.3 Per-Service Environment Files

Each service may have a local `.env` file for development, but examples must be committed as `.env.example` only.

Required examples:

```text
services/dms-api/.env.example
apps/dms-ui/.env.example
apps/chatbot-ui/.env.example
services/wrapper-api/.env.example
agents/master-agent/.env.example
agents/metadata-agent/.env.example
agents/fetch-document-agent/.env.example
agents/ocr-agent/.env.example
agents/vector-ingestion-agent/.env.example
agents/answer-agent/.env.example
mcp-servers/dms-query-mcp/.env.example
mcp-servers/dms-fetch-mcp/.env.example
mcp-servers/vector-mcp/.env.example
```

### 17.4 Configuration Hierarchy

Use this precedence order:

1. Runtime environment variables.
2. Service-specific `.env` file for local development.
3. Root `.env` file for Docker Compose.
4. Safe defaults in code only for non-secret optional settings.

### 17.5 Model Catalog Configuration Rules

1. Build the wrapper API model catalog from environment configuration, not from React source code.
2. `MODEL_ALLOWED_OCR_NAMES` defines the OCR dropdown allowlist.
3. `MODEL_ALLOWED_AGENT_NAMES` defines the agent/functionality dropdown allowlist.
4. `MODEL_DEFAULT_OCR_NAME` must be a member of `MODEL_ALLOWED_OCR_NAMES`.
5. `MODEL_DEFAULT_AGENT_NAME` must be a member of `MODEL_ALLOWED_AGENT_NAMES`.
6. `MODEL_FALLBACK_OCR_NAME` must be a member of `MODEL_ALLOWED_OCR_NAMES`.
7. `MODEL_FALLBACK_AGENT_NAME` must be a member of `MODEL_ALLOWED_AGENT_NAMES`.
8. `MODEL_EMBEDDING_NAME` must not be returned in either selectable dropdown.
9. Startup validation must fail when any default or fallback model is missing from its corresponding allowlist.
10. The model catalog response must keep OCR-capable and agent-capable models in separate dropdown sections even when the same physical model is configured for both groups.
11. `MODEL_BASE_URL` must point at an OpenAI-compatible endpoint that supports `POST /chat/completions` for selected agent/functionality models.
12. `MODEL_API_KEY` is optional for local unauthenticated model runners, but when set it must be sent as a bearer token and must not be logged.
13. Master agent and answer agent must both receive `MODEL_BASE_URL` and optional `MODEL_API_KEY` from runtime configuration.

---

## 18. Docker and Local Infrastructure Instructions

### 18.1 Required Docker Compose Services

The local Docker Compose stack must include:

- `mysql`
- `mongodb`
- `qdrant`
- `dms-api`
- `dms-ui`
- `chatbot-ui`
- `wrapper-api`
- `master-agent`
- `metadata-agent`
- `fetch-document-agent`
- `ocr-agent`
- `vector-ingestion-agent`
- `answer-agent`
- `dms-query-mcp`
- `dms-fetch-mcp`
- `vector-mcp`

### 18.2 Docker Compose Rules

1. Use named Docker volumes for MySQL, MongoDB, and Qdrant data.
2. Use a shared internal network for backend services.
3. Expose only required UI and API ports to localhost.
4. Use health checks and `depends_on` readiness where practical.
5. Run migrations before DMS API starts accepting traffic.
6. Keep Dockerfiles small and deterministic.
7. Do not bake secrets into images.
8. Use `host.docker.internal` only for local model endpoint access when needed.
9. Pass `MODEL_BASE_URL` and optional `MODEL_API_KEY` into every service that performs direct model calls, including `master-agent` and `answer-agent`.
10. Provide `scripts/dev-up.sh`, `scripts/dev-down.sh`, and `scripts/reset-local-data.sh`.

### 18.3 Kubernetes Readiness

Do not build full Kubernetes deployment first. Keep the code Kubernetes-ready by:

- Using environment variables for all config.
- Supporting liveness and readiness endpoints.
- Avoiding local filesystem persistence except temporary files.
- Using graceful shutdown.
- Supporting horizontal scaling for stateless services.
- Keeping DMS file persistence in MongoDB, not container disk.

---

## 19. Security Rules

### 19.1 Authentication

For local PoC:

1. Use API keys for internal service-to-service calls.
2. Use a simple local auth mode for UIs.
3. Include clear extension points for OIDC/JWT.

Do not build a fake auth system that looks production-grade but is insecure. Mark local auth as PoC-only.

### 19.2 Authorization

Implement basic role concepts:

| Role | Capability |
|---|---|
| `dms_uploader` | Upload documents through DMS UI/API |
| `dms_reader` | Search and fetch documents |
| `chat_user` | Ask chatbot questions |
| `service_agent` | Internal agent and MCP calls |
| `admin` | Local diagnostics and reset operations |

### 19.3 Upload Security

1. Accept PDFs only.
2. Validate content type and file signature.
3. Enforce upload size limit.
4. Sanitize file names.
5. Do not execute or parse embedded scripts.
6. Do not log raw PDF content.
7. Do not log sensitive metadata values unnecessarily.
8. Add a placeholder malware-scan interface for future production use.

### 19.4 Secrets

1. Commit only `.env.example` files.
2. Never commit real secrets.
3. Never print secrets at startup.
4. Redact secrets in logs.
5. Keep secret names consistent across services.

### 19.5 Encryption

For local PoC:

- Use HTTP inside Docker network unless TLS is specifically required.
- Keep TLS termination out of scope for local PoC.
- Document where TLS would be added for production.

For persisted data:

- Use Docker volume persistence for local data.
- Document that production requires encryption at rest through managed storage or platform controls.

### 19.6 PII Handling

1. Treat policy numbers, customer IDs, beneficiary IDs, and PDF content as sensitive.
2. Redact sensitive values in logs where possible.
3. Do not send PDF content to external cloud services.
4. Use local models only for the PoC.
5. Keep extracted text and vectors local.
6. Include source handle IDs in citations without exposing unnecessary PII.

### 19.7 Threat Model Requirements

Document threats for:

- Unauthorized document upload.
- Unauthorized document download.
- Prompt injection from document content.
- Malicious PDF payloads.
- Over-broad CORS.
- Service-to-service credential leakage.
- Direct database access bypassing DMS APIs.
- Vector database poisoning.
- Hallucinated answers or citations.

For every threat, document mitigation in `docs/security/threat-model.md`.

---

## 20. Observability Rules

### 20.1 Logging

All services must use structured JSON logs with:

- timestamp
- level
- service name
- environment
- request ID
- trace ID when available
- actor ID when available
- route or operation name
- latency
- outcome
- error code when applicable

Do not log:

- PDF binary
- full extracted document text by default
- secrets
- API keys
- JWTs
- raw embeddings

### 20.2 Metrics

Expose Prometheus-compatible metrics where practical.

Required DMS API metrics:

- upload request count
- upload success count
- upload failure count
- query count
- fetch count
- upload latency
- query latency
- fetch latency
- PDF size histogram
- MySQL connection status
- MongoDB connection status

Required AI metrics:

- vector-first hit count
- DMS fallback count
- documents fetched count
- OCR latency
- embedding latency
- answer latency
- model error count
- A2A call count
- MCP call count

### 20.3 Tracing

Propagate request ID and trace context through:

1. DMS UI to DMS API.
2. Chatbot UI to wrapper API.
3. Wrapper API to master agent.
4. Master agent to specialized agents over A2A.
5. Specialized agents to MCP servers.
6. MCP servers to DMS API.

### 20.4 Health and Readiness

Every service must expose:

```http
GET /health/live
GET /health/ready
```

Liveness means the process is running.

Readiness means required dependencies are reachable.

---

## 21. Testing Standards

### 21.1 Unit Tests

Required coverage:

- Config validation.
- DMS handle ID generation.
- DMS request validation.
- DMS metadata repository query construction.
- GridFS service behavior with mocks.
- Upload compensation behavior.
- Agent routing decisions.
- Vector chunking.
- Citation formatting.

### 21.2 Integration Tests

Required DMS integration tests:

1. Upload PDF through DMS API.
2. Verify metadata row in MySQL.
3. Verify GridFS file in MongoDB.
4. Query by policy number returns handle ID.
5. Fetch by handle ID returns original PDF hash.
6. Soft delete hides document from default query.
7. Delta query with `updatedAfter` returns expected documents.

Required AI integration tests:

1. Metadata agent calls DMS Query MCP.
2. Fetch document agent calls DMS Fetch MCP.
3. OCR agent extracts text from fixture PDFs.
4. Vector ingestion agent writes Qdrant chunks.
5. Answer agent returns citations from Qdrant chunks.
6. Master agent performs vector-first decision.

### 21.3 Contract Tests

Create contract tests for:

- DMS Upload API.
- DMS Query API.
- DMS Fetch API.
- DMS Metadata API.
- DMS Query MCP tool.
- DMS Fetch MCP tool.
- Every A2A agent card.
- Every A2A invoke request and response.
- Wrapper API chat endpoint.
- Wrapper API model catalog endpoint.

### 21.4 API Tests

API tests must verify:

- Success responses.
- Validation failures.
- Authentication failures.
- Authorization failures.
- Not found behavior.
- Soft delete behavior.
- Pagination behavior.
- Error envelope shape.
- Wrapper API model catalog response shape, including separate OCR and agent dropdown sections.
- Rejection of an unknown or disallowed `selectedOcrModelName`.
- Rejection of an unknown or disallowed `selectedAgentModelName`.
- Rejection of a valid OCR model submitted in the agent field.
- Rejection of a valid agent model submitted in the OCR field.

### 21.5 UI Tests

DMS UI Playwright tests must verify:

1. Upload page renders.
2. Invalid file type is rejected.
3. Missing required metadata is rejected.
4. Valid PDF upload succeeds.
5. Success page shows handle ID.
6. Search finds uploaded document.
7. Detail page displays metadata.
8. PDF view or download works.

Chatbot UI Playwright tests must verify:

1. User can enter question.
2. User can choose minimum or all documents.
3. User can choose vector-only, delta-only, or fetch-latest.
4. OCR model dropdown loads from `GET /api/v1/models`.
5. Agent/functionality model dropdown loads from `GET /api/v1/models`.
6. User can select `ai/qwen3-vl:latest` as the OCR model when it is enabled in the OCR model catalog.
7. User can select `ai/gemma4:31B` as the agent/functionality model when it is enabled in the agent model catalog.
8. Submitted chat request includes `selectedOcrModelName`.
9. Submitted chat request includes `selectedAgentModelName`.
10. Answer displays citations.
11. Route trace displays selected and actual OCR model when OCR occurred.
12. Route trace displays selected and actual agent/functionality model.
13. Route details display whether DMS fetch occurred and which models were used.

### 21.6 End-to-End Demo Test

Create one smoke test that performs this entire flow:

1. Start Docker Compose.
2. Upload fixture PDF through DMS API or DMS UI.
3. Query DMS API for policy number.
4. Ask chatbot a question about that policy.
5. Verify vector database is checked first.
6. Verify DMS fallback occurs if vector coverage is missing.
7. Verify PDF is fetched through DMS Fetch MCP.
8. Verify OCR runs.
9. Verify vector ingestion runs.
10. Verify final answer includes source handle ID.

### 21.7 Performance Tests

For PoC, include lightweight performance checks:

- Upload a 5 MB PDF.
- Query 1,000 metadata rows.
- Fetch a PDF by handle ID.
- Ingest 10 documents into Qdrant.
- Ask a question after ingestion.

Do not over-optimize based on PoC performance results.

### 21.8 Security Tests

Minimum tests:

- Upload non-PDF file fails.
- Oversized PDF fails.
- Missing API key fails for protected APIs.
- Invalid API key fails.
- CORS rejects unapproved origin where practical.
- Path traversal file names are sanitized.
- Error responses do not expose stack traces.

---

## 22. Coding Standards

### 22.1 TypeScript Rules

1. Enable `strict` mode.
2. Avoid `any`.
3. Prefer typed request and response schemas.
4. Validate external input at boundaries.
5. Use discriminated unions for agent decisions where useful.
6. Keep DTOs in `packages/api-contracts` when shared.
7. Keep domain logic separate from Fastify route handlers.

### 22.2 Backend Structure Rules

Fastify services must use this pattern:

```text
src/
├── app.ts              # builds Fastify app
├── server.ts           # starts HTTP server
├── config.ts           # env validation
├── routes/             # route registration
├── services/           # business logic
├── repositories/       # persistence access
├── schemas/            # API schemas
├── plugins/            # Fastify plugins
├── errors/             # typed errors
└── observability/      # logs, metrics, tracing
```

Route handlers must be thin. Business logic belongs in services.

### 22.3 UI Structure Rules

React apps must use this pattern:

```text
src/
├── api/                # typed API clients
├── components/         # reusable UI components
├── routes/             # TanStack Router routes
├── hooks/              # reusable hooks
├── lib/                # utility functions
├── config/             # environment config
├── types/              # app-level types
└── main.tsx
```

### 22.4 Error Handling Rules

1. Use typed application errors.
2. Map internal errors to safe API responses.
3. Preserve request ID in all errors.
4. Log server-side error details.
5. Return safe client-facing messages.
6. Never swallow errors silently.

### 22.5 Data Validation Rules

Validate:

- All HTTP request bodies.
- All HTTP query parameters.
- All route parameters.
- All multipart fields.
- All environment variables.
- All MCP tool inputs.
- All A2A messages.
- All model outputs before using them for control flow.

---

## 23. Documentation Rules

### 23.1 Required Docs

Create and maintain:

```text
docs/api/dms-api.md
docs/api/wrapper-api.md
docs/api/agents.md
docs/api/mcp-tools.md
docs/architecture/local-architecture.md
docs/security/threat-model.md
docs/runbooks/local-demo.md
docs/runbooks/troubleshooting.md
docs/adr/
```

### 23.2 API Documentation

Every API service must expose OpenAPI documentation where practical.

DMS API docs must include:

- Upload endpoint.
- Query endpoint.
- Metadata endpoint.
- Fetch endpoint.
- Delete endpoint.
- Error envelope.
- Auth requirements.
- Example curl commands.

### 23.3 README Updates

When adding or changing a service, update README with:

- Service purpose.
- Port.
- Environment variables.
- How to run locally.
- How to test.
- Troubleshooting notes.

---

## 24. Coding-Agent Behavioral Guidelines

### 24.1 Think Before Coding

Before changing files, coding agents must state:

- The objective.
- The files likely to change.
- The assumptions being made.
- The validation steps that will prove success.

### 24.2 Surgical Changes

1. Touch only files required for the task.
2. Do not refactor unrelated code.
3. Do not rename public contracts without updating tests and docs.
4. Do not introduce new dependencies without a clear reason.
5. Do not replace selected architecture without an ADR.

### 24.3 Validation First

Every implementation task must include validation:

- Unit test.
- Integration test.
- Contract test.
- Manual curl command.
- UI test when applicable.

### 24.4 Stop Conditions

Stop and report clearly if:

- A required environment variable is undefined.
- A contract contradicts an existing test.
- A database migration would destroy data.
- A dependency requires internet access during local runtime.
- A model endpoint cannot support required operation.
- An implementation would bypass required architecture boundaries.

Do not invent hidden requirements.

---

## 25. Required Implementation Order

Build in this order unless a task explicitly says otherwise.

### Phase 1 - Monorepo and Shared Foundations

Deliverables:

1. `pnpm-workspace.yaml`
2. root `package.json`
3. root `tsconfig.base.json`
4. shared config package
5. shared logger package
6. shared error package
7. shared API contracts package
8. Docker Compose skeleton

Validation:

- `pnpm install` succeeds.
- `pnpm typecheck` succeeds.
- Docker Compose starts MySQL, MongoDB, and Qdrant.

### Phase 2 - DMS Databases

Deliverables:

1. MySQL migrations for `documents`, `document_audit_events`, and `ingestion_checkpoints`.
2. MongoDB GridFS initialization.
3. Database connection packages.
4. Seed fixture PDFs and metadata.

Validation:

- Migrations run successfully.
- MySQL indexes exist.
- MongoDB GridFS bucket is usable.
- Seed script can upload or prepare fixture documents.

### Phase 3 - DMS API

Deliverables:

1. DMS Fastify service.
2. Upload endpoint.
3. Query endpoint.
4. Metadata endpoint.
5. Fetch endpoint.
6. Soft delete endpoint.
7. Health, readiness, metrics.
8. OpenAPI docs.
9. DMS API tests.

Validation:

- Upload a fixture PDF through API.
- Query by policy number returns handle ID.
- Fetch by handle ID returns the same PDF hash.
- MySQL row exists.
- MongoDB GridFS file exists.
- Tests pass.

### Phase 4 - DMS UI

Deliverables:

1. DMS UI app.
2. Upload page.
3. Search page.
4. Document detail page.
5. PDF view or download page.
6. Typed DMS API client.
7. Playwright tests.

Validation:

- User can upload PDF through browser.
- Success result shows handle ID.
- Search finds uploaded document.
- Detail page displays metadata.
- PDF can be downloaded or viewed.

### Phase 5 - MCP Wrappers

Deliverables:

1. DMS Query MCP server.
2. DMS Fetch MCP server.
3. Vector MCP server if needed.
4. MCP contract tests.

Validation:

- MCP query tool returns DMS metadata.
- MCP fetch tool returns PDF content or temp file reference.
- MCP tools do not access databases directly.

### Phase 6 - Specialized Agents

Deliverables:

1. Metadata agent.
2. Fetch document agent.
3. OCR agent.
4. Vector ingestion agent.
5. Answer agent.
6. A2A agent cards.
7. A2A contract tests.

Validation:

- Each agent responds to `/agent-card`.
- Each agent can be invoked independently.
- Each agent performs only its assigned responsibility.

### Phase 7 - Master Agent and Wrapper API

Deliverables:

1. Master agent with LangGraph orchestration.
2. Vector-first routing.
3. Minimum versus all document decision handling.
4. Latest/delta handling.
5. Wrapper API for chatbot.
6. OpenAI-compatible model call for retrieval planning and vector sufficiency decisions.

Validation:

- Vector is checked first.
- DMS fallback occurs only when needed.
- User fetch preferences are respected.
- Route trace is returned.
- Test coverage proves the master agent calls the model endpoint for retrieval planning.
- No routing decision is implemented only as hardcoded keyword matching or empty-result checks.

### Phase 8 - Chatbot UI

Deliverables:

1. Chatbot UI.
2. Question entry.
3. Fetch mode selection.
4. Freshness mode selection.
5. OCR model dropdown populated from `GET /api/v1/models`.
6. Agent/functionality model dropdown populated from `GET /api/v1/models`.
7. Answer rendering.
8. Citation rendering.
9. Route trace rendering with selected and effective model names.

Validation:

- User asks question.
- UI sends correct request.
- Request includes `selectedOcrModelName` and `selectedAgentModelName`.
- Answer includes citations.
- Route shows vector and DMS behavior.
- Route shows selected and actual OCR and agent/functionality models.

### Phase 9 - End-to-End Hardening

Deliverables:

1. Smoke test script.
2. E2E tests.
3. Security tests.
4. Performance smoke tests.
5. Troubleshooting docs.
6. Demo runbook.

Validation:

- `docker compose up` starts the full stack.
- DMS upload works.
- Chatbot answer works.
- The smoke path exercises a real configured model endpoint for master-agent planning and answer-agent generation.
- Tests pass.
- Logs and health checks are usable.

---

## 26. Definition of Done

The PoC is done only when all of the following are true:

1. Full stack starts locally through Docker Compose.
2. MySQL, MongoDB, and Qdrant use persistent Docker volumes.
3. DMS API can upload, query, fetch, and soft delete documents.
4. DMS API stores metadata in MySQL.
5. DMS API stores PDFs in MongoDB GridFS.
6. DMS UI can upload PDFs through the DMS API.
7. DMS UI can search and view uploaded documents.
8. DMS UI can download or view PDFs by handle ID.
9. MCP wrappers call DMS APIs and do not access databases directly.
10. Every specialized agent is exposed over A2A.
11. Every specialized agent also has an independent local invoke endpoint.
12. Master agent checks vector database first.
13. Master agent can fetch minimum or all documents based on user preference.
14. Master agent supports latest/delta behavior.
15. OCR extraction works on fixture PDFs.
16. Vector ingestion writes chunks with handle IDs and page metadata.
17. Answer agent returns cited answers.
18. Chatbot UI displays answer, citations, selected OCR model, actual OCR model used, selected agent/functionality model, actual agent/functionality model used, and route trace.
19. Chatbot UI includes an OCR model dropdown populated from the wrapper API.
20. Chatbot UI includes an agent/functionality model dropdown populated from the wrapper API.
21. `ai/qwen3-vl:latest` is available as a selectable OCR model when configured.
22. `ai/gemma4:31B` is available as a selectable agent/functionality model when configured.
23. Unit tests pass.
24. Integration tests pass.
25. Contract tests pass.
26. DMS UI E2E tests pass.
27. Chatbot E2E test passes.
28. Security smoke tests pass.
29. README and runbooks are updated.
30. No service URL or credential is hardcoded.
31. No real secrets are committed.

---

## 27. Prohibited Changes Without ADR

Do not make these changes without adding or updating an ADR:

1. Replacing MySQL as DMS metadata store.
2. Replacing MongoDB GridFS as DMS PDF store.
3. Allowing agents to query DMS databases directly.
4. Combining all agents into one service without separate APIs.
5. Removing MCP from DMS access path.
6. Removing A2A from agent-to-agent communication.
7. Replacing Qdrant as local vector database.
8. Replacing TanStack-based UIs.
9. Replacing Fastify as backend framework.
10. Adding cloud dependencies to the local PoC runtime.
11. Removing vector-first behavior.
12. Removing minimum/all document fetch choice.
13. Removing latest/delta fetch choice.
14. Removing either chatbot model-selection dropdown.
15. Combining OCR and agent/functionality model selection into a single dropdown.
16. Hardcoding UI model names instead of using the wrapper API model catalog.

---

## 28. Useful Local Validation Commands

These commands must be kept working as the project evolves.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:e2e
```

```bash
docker compose -f infra/docker-compose.yml up --build
```

```bash
./scripts/seed-dms.sh
./scripts/smoke-test.sh
```

Example DMS upload command:

```bash
curl -X POST "http://localhost:3101/api/v1/documents" \
  -H "x-api-key: local-dev-dms-api-key" \
  -F "file=@data/fixtures/pdfs/sample-policy.pdf;type=application/pdf" \
  -F "policyNumber=POL-10001" \
  -F "documentType=POLICY_DOCUMENT" \
  -F "customerId=CUST-10001" \
  -F "sourceSystem=LOCAL_CURL"
```

Example DMS query command:

```bash
curl "http://localhost:3101/api/v1/documents?policyNumber=POL-10001" \
  -H "x-api-key: local-dev-dms-api-key"
```

Example DMS fetch command:

```bash
curl "http://localhost:3101/api/v1/documents/doc_01HZYEXAMPLE000000000000/content" \
  -H "x-api-key: local-dev-dms-api-key" \
  -o downloaded.pdf
```

Example chatbot model catalog command:

```bash
curl "http://localhost:3200/api/v1/models" \
  -H "x-api-key: local-dev-chatbot-api-key"
```

Example chatbot question with selected OCR and agent models:

```bash
curl -X POST "http://localhost:3200/api/v1/chat/question" \
  -H "content-type: application/json" \
  -H "x-api-key: local-dev-chatbot-api-key" \
  -d '{
    "question": "What is the beneficiary listed on policy POL-10001?",
    "policyNumber": "POL-10001",
    "documentFetchMode": "MINIMUM",
    "freshnessMode": "DELTA_ONLY",
    "selectedOcrModelName": "ai/qwen3-vl:latest",
    "selectedAgentModelName": "ai/gemma4:31B",
    "sessionId": "chat-local-demo"
  }'
```

---

## 29. Final Implementation Guidance

Build the DMS first. The AI layer depends on having realistic document APIs, metadata, handle IDs, and persisted PDFs.

The smallest valuable vertical slice is:

1. DMS API upload stores metadata in MySQL and PDF in MongoDB.
2. DMS UI uploads and searches documents.
3. MCP query and fetch wrappers call the DMS API.
4. Metadata and fetch agents call MCP wrappers.
5. Master agent performs vector-first check, then DMS fallback.
6. OCR and vector ingestion index fetched documents.
7. Answer agent returns cited answer.
8. Chatbot UI lets the user select both the OCR model and the agent/functionality model, then displays the answer, selected models, actual models used, and source handle IDs.

Do not optimize before this slice works end to end.
