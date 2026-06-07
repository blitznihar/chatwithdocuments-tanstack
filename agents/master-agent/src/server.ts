import Fastify from "fastify";
import { chatQuestionSchema } from "@doc-ai/api-contracts";
import { envNumber, envOptionalString, envString } from "@doc-ai/shared-config";
import { errorStatus, toErrorEnvelope } from "@doc-ai/shared-errors";
import { orchestrateQuestion, type MasterAgentClients } from "./orchestrator.js";

const app = Fastify({ logger: false });
const port = envNumber("MASTER_AGENT_PORT", 3301);

const clients: MasterAgentClients = {
  answerAgentUrl: envString("ANSWER_AGENT_URL", "http://localhost:3306"),
  fetchDocumentAgentUrl: envString("FETCH_DOCUMENT_AGENT_URL", "http://localhost:3303"),
  metadataAgentUrl: envString("METADATA_AGENT_URL", "http://localhost:3302"),
  modelApiKey: envOptionalString("MODEL_API_KEY"),
  modelBaseUrl: envString("MODEL_BASE_URL", "http://host.docker.internal:12434/engines/v1"),
  ocrAgentUrl: envString("OCR_AGENT_URL", "http://localhost:3304"),
  vectorIngestionAgentUrl: envString("VECTOR_INGESTION_AGENT_URL", "http://localhost:3305"),
  vectorMcpUrl: envString("VECTOR_MCP_URL", "http://localhost:3403")
};

app.get("/health/live", async () => ({ status: "live", service: "master-agent" }));
app.get("/health/ready", async () => ({ status: "ready", service: "master-agent", clients }));
app.get("/metrics", async () => `service_info{name="master-agent"} 1\n`);
app.post("/api/v1/chat/question", async (request) => orchestrateQuestion(chatQuestionSchema.parse(request.body), clients));
app.post("/a2a/invoke", async (request) => {
  const body = request.body as { taskId?: string; input?: unknown };
  return {
    taskId: body.taskId ?? crypto.randomUUID(),
    status: "completed",
    output: await orchestrateQuestion(chatQuestionSchema.parse(body.input), clients)
  };
});

app.setErrorHandler((error, request, reply) => {
  reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
});

await app.listen({ host: "0.0.0.0", port });
