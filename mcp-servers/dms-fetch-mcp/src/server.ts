import Fastify from "fastify";
import { mcpFetchInputSchema, type DocumentMetadata } from "@doc-ai/api-contracts";
import { getBinaryBase64, getJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";
import { errorStatus, toErrorEnvelope } from "@doc-ai/shared-errors";

const app = Fastify({ logger: false });
const port = envNumber("DMS_FETCH_MCP_PORT", 3402);
const dmsApiUrl = envString("DMS_API_URL", "http://localhost:3101");

app.get("/health/live", async () => ({ status: "live", service: "dms-fetch-mcp" }));
app.get("/health/ready", async () => ({ status: "ready", service: "dms-fetch-mcp", dmsApiUrl }));
app.get("/metrics", async () => `service_info{name="dms-fetch-mcp"} 1\n`);
app.get("/api/v1/tools", async () => ({
  tools: [
    {
      name: "fetchDocument",
      description: "Fetch a PDF by handle ID through the DMS API"
    }
  ]
}));

app.post("/api/v1/tools/fetch-document", async (request) => {
  const { handleId } = mcpFetchInputSchema.parse(request.body ?? {});
  const metadata = await getJson<DocumentMetadata>(`${dmsApiUrl}/api/v1/documents/${encodeURIComponent(handleId)}`);
  const pdfBase64 = await getBinaryBase64(`${dmsApiUrl}/api/v1/documents/${encodeURIComponent(handleId)}/file`);
  return {
    handleId,
    metadata,
    pdfBase64
  };
});

app.setErrorHandler((error, request, reply) => {
  reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
});

await app.listen({ host: "0.0.0.0", port });
