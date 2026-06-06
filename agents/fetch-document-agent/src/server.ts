import { createAgentApp, postJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";

const port = envNumber("FETCH_DOCUMENT_AGENT_PORT", 3303);
const dmsFetchMcpUrl = envString("DMS_FETCH_MCP_URL", "http://localhost:3402");

const app = createAgentApp({
  name: "fetch-document-agent",
  description: "Fetches PDFs through the DMS Fetch MCP wrapper",
  handler: (input) => postJson(`${dmsFetchMcpUrl}/api/v1/tools/fetch-document`, input)
});

await app.listen({ host: "0.0.0.0", port });
