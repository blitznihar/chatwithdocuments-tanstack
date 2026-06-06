import { createAgentApp, postJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";

const port = envNumber("METADATA_AGENT_PORT", 3302);
const dmsQueryMcpUrl = envString("DMS_QUERY_MCP_URL", "http://localhost:3401");

const app = createAgentApp({
  name: "metadata-agent",
  description: "Queries DMS metadata through the DMS Query MCP wrapper",
  handler: (input) => postJson(`${dmsQueryMcpUrl}/api/v1/tools/query-documents`, input)
});

await app.listen({ host: "0.0.0.0", port });
