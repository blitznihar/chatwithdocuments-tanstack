import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { chatQuestionSchema, type ChatQuestionResponse } from "@doc-ai/api-contracts";
import { postJson } from "@doc-ai/agent-runtime";
import { errorStatus, toErrorEnvelope } from "@doc-ai/shared-errors";
import { assertModelSelectionAllowed, type ModelCatalogConfig, buildModelCatalog } from "./modelCatalog.js";

export type WrapperConfig = {
  allowedOrigins: string[];
  masterAgentUrl: string;
  modelCatalog: ModelCatalogConfig;
};

export async function buildWrapperApi(config: WrapperConfig) {
  const app = Fastify({ logger: false });
  const catalog = buildModelCatalog(config.modelCatalog);

  await app.register(cors, {
    origin: config.allowedOrigins
  });
  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  app.get("/health/live", async () => ({ status: "live", service: "wrapper-api" }));
  app.get("/health/ready", async () => ({ status: "ready", service: "wrapper-api", masterAgentUrl: config.masterAgentUrl }));
  app.get("/metrics", async () => `service_info{name="wrapper-api"} 1\n`);

  app.get("/api/v1/models", async () => catalog);

  app.post("/api/v1/chat/question", async (request) => {
    const body = chatQuestionSchema.parse(request.body);
    assertModelSelectionAllowed(catalog, body.selectedOcrModelName, body.selectedAgentModelName);
    return postJson<ChatQuestionResponse>(`${config.masterAgentUrl}/api/v1/chat/question`, body);
  });

  app.setErrorHandler((error, request, reply) => {
    reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
  });

  return app;
}
