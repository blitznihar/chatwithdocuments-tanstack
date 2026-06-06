import Fastify from "fastify";
import { chatQuestionSchema } from "@doc-ai/api-contracts";
import { postJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";
import { errorStatus, toErrorEnvelope } from "@doc-ai/shared-errors";

const app = Fastify({ logger: false });
const port = envNumber("AGENTIC_API_PORT", 3202);
const masterAgentUrl = envString("MASTER_AGENT_URL", "http://localhost:3301");

app.get("/health/live", async () => ({ status: "live", service: "agentic-api" }));
app.get("/health/ready", async () => ({ status: "ready", service: "agentic-api", masterAgentUrl }));
app.get("/metrics", async () => `service_info{name="agentic-api"} 1\n`);
app.post("/api/v1/chat/question", async (request) =>
  postJson(`${masterAgentUrl}/api/v1/chat/question`, chatQuestionSchema.parse(request.body))
);

app.setErrorHandler((error, request, reply) => {
  reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
});

await app.listen({ host: "0.0.0.0", port });
