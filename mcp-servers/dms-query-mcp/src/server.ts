import Fastify from "fastify";
import { documentQuerySchema } from "@doc-ai/api-contracts";
import { getJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";
import { errorStatus, toErrorEnvelope } from "@doc-ai/shared-errors";

const app = Fastify({ logger: false });
const port = envNumber("DMS_QUERY_MCP_PORT", 3401);
const dmsApiUrl = envString("DMS_API_URL", "http://localhost:3101");

app.get("/health/live", async () => ({ status: "live", service: "dms-query-mcp" }));
app.get("/health/ready", async () => ({ status: "ready", service: "dms-query-mcp", dmsApiUrl }));
app.get("/metrics", async () => `service_info{name="dms-query-mcp"} 1\n`);
app.get("/api/v1/tools", async () => ({
  tools: [
    {
      name: "queryDocuments",
      description: "Query DMS documents by metadata through the DMS API"
    }
  ]
}));

app.post("/api/v1/tools/query-documents", async (request) => {
  const query = documentQuerySchema.parse(request.body ?? {});
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return getJson(`${dmsApiUrl}/api/v1/documents?${params.toString()}`);
});

app.setErrorHandler((error, request, reply) => {
  reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
});

await app.listen({ host: "0.0.0.0", port });
