import Fastify from "fastify";
import { z } from "zod";
import { vectorChunkSchema, type VectorChunk } from "@doc-ai/api-contracts";
import { envNumber } from "@doc-ai/shared-config";
import { errorStatus, toErrorEnvelope } from "@doc-ai/shared-errors";

const app = Fastify({ logger: false });
const port = envNumber("VECTOR_MCP_PORT", 3403);
const chunks = new Map<string, VectorChunk>();

const upsertSchema = z.object({
  chunks: z.array(vectorChunkSchema)
});

const searchSchema = z.object({
  question: z.string().min(1),
  policyNumber: z.string().optional(),
  handleIds: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(20).default(5)
});

app.get("/health/live", async () => ({ status: "live", service: "vector-mcp" }));
app.get("/health/ready", async () => ({ status: "ready", service: "vector-mcp", chunks: chunks.size }));
app.get("/metrics", async () => `service_info{name="vector-mcp"} 1\nvector_chunks_total ${chunks.size}\n`);
app.get("/api/v1/tools", async () => ({
  tools: [
    { name: "upsertChunks", description: "Index OCR text chunks into the local vector collection" },
    { name: "searchChunks", description: "Search indexed chunks with simple local semantic scoring" }
  ]
}));

app.post("/api/v1/tools/upsert-chunks", async (request) => {
  const parsed = upsertSchema.parse(request.body ?? {});
  for (const chunk of parsed.chunks) {
    chunks.set(chunk.chunkId, chunk);
  }
  return {
    upserted: parsed.chunks.length,
    total: chunks.size
  };
});

app.post("/api/v1/tools/search-chunks", async (request) => {
  const parsed = searchSchema.parse(request.body ?? {});
  const tokens = tokenize(parsed.question);
  const results = Array.from(chunks.values())
    .filter((chunk) => !parsed.policyNumber || chunk.policyNumber === parsed.policyNumber)
    .filter((chunk) => !parsed.handleIds?.length || parsed.handleIds.includes(chunk.handleId))
    .map((chunk) => ({
      chunk,
      score: scoreChunk(tokens, chunk)
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, parsed.limit);
  return {
    chunks: results.map((result) => result.chunk),
    count: results.length
  };
});

app.setErrorHandler((error, request, reply) => {
  reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
});

await app.listen({ host: "0.0.0.0", port });

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function scoreChunk(tokens: string[], chunk: VectorChunk): number {
  const haystack = `${chunk.text} ${chunk.policyNumber ?? ""} ${chunk.documentType ?? ""}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}
