import Fastify, { type FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { a2aInvokeSchema, type A2AResponse } from "@doc-ai/api-contracts";
import { errorStatus, ServiceError, toErrorEnvelope } from "@doc-ai/shared-errors";

export type AgentHandler = (input: Record<string, unknown>) => Promise<unknown>;

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message = parsed?.error?.message ?? `Request failed: ${response.status}`;
    throw new ServiceError("UPSTREAM_ERROR", message, response.status, parsed);
  }
  return parsed as T;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message = parsed?.error?.message ?? `Request failed: ${response.status}`;
    throw new ServiceError("UPSTREAM_ERROR", message, response.status, parsed);
  }
  return parsed as T;
}

export async function getBinaryBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ServiceError("UPSTREAM_ERROR", `Request failed: ${response.status}`, response.status);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

export function chunkText(text: string, maxLength = 600): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += maxLength) {
    chunks.push(clean.slice(i, i + maxLength));
  }
  return chunks;
}

export function extractPdfTextFromBase64(pdfBase64: string): string {
  const raw = Buffer.from(pdfBase64, "base64").toString("latin1");
  const literalStrings = Array.from(raw.matchAll(/\(([^()]*)\)/g), (match) => match[1] ?? "");
  const printable = literalStrings.join(" ").replace(/\\[rn]/g, " ").replace(/\s+/g, " ").trim();
  if (printable) return printable;
  return raw.replace(/[^\x20-\x7E]+/g, " ").replace(/\s+/g, " ").trim();
}

export function createAgentApp(options: {
  name: string;
  description: string;
  handler: AgentHandler;
}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health/live", async () => ({ status: "live", service: options.name }));
  app.get("/health/ready", async () => ({ status: "ready", service: options.name }));
  app.get("/metrics", async () => `service_info{name="${options.name}"} 1\n`);

  app.get("/a2a/agent-card", async () => ({
    name: options.name,
    description: options.description,
    protocol: "a2a-local-poc",
    endpoints: {
      invoke: "/a2a/invoke",
      diagnosticInvoke: "/api/v1/invoke"
    }
  }));

  const invoke = async (body: unknown): Promise<A2AResponse> => {
    const parsed = a2aInvokeSchema.parse(body);
    const taskId = parsed.taskId ?? uuidv4();
    try {
      const output = await options.handler(parsed.input);
      return { taskId, status: "completed", output };
    } catch (error) {
      return {
        taskId,
        status: "failed",
        error: {
          code: error instanceof ServiceError ? error.code : "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Agent failed"
        }
      };
    }
  };

  app.post("/a2a/invoke", async (request) => invoke(request.body));
  app.post("/api/v1/invoke", async (request) => invoke(request.body));

  app.setErrorHandler((error, request, reply) => {
    reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
  });

  return app;
}

export async function invokeAgent<T>(baseUrl: string, input: Record<string, unknown>): Promise<T> {
  const response = await postJson<A2AResponse>(`${baseUrl}/a2a/invoke`, {
    taskId: uuidv4(),
    input
  });
  if (response.status === "failed") {
    throw new ServiceError(
      response.error?.code ?? "AGENT_ERROR",
      response.error?.message ?? "Agent failed",
      502,
      response
    );
  }
  return response.output as T;
}
