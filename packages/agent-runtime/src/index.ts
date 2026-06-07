import Fastify, { type FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { a2aInvokeSchema, type A2AResponse } from "@doc-ai/api-contracts";
import { errorStatus, ServiceError, toErrorEnvelope } from "@doc-ai/shared-errors";

export type AgentHandler = (input: Record<string, unknown>) => Promise<unknown>;
export type ModelChatRole = "system" | "user" | "assistant";
export type ModelChatMessage = {
  role: ModelChatRole;
  content: string;
};

export type CompleteChatOptions = {
  apiKey?: string;
  baseUrl: string;
  maxTokens?: number;
  messages: ModelChatMessage[];
  model: string;
  temperature?: number;
};

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

export async function completeChat(options: CompleteChatOptions): Promise<string> {
  const response = await fetch(modelUrl(options.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 700
    })
  });
  const text = await response.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch (error) {
    throw new ServiceError("MODEL_API_ERROR", "Model response was not JSON", response.ok ? 502 : response.status, {
      response: text,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
  if (!response.ok) {
    const message = parsed?.error?.message ?? `Model request failed: ${response.status}`;
    throw new ServiceError("MODEL_API_ERROR", message, response.status, parsed);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ServiceError("MODEL_API_ERROR", "Model response did not include assistant content", 502, parsed);
  }
  return content.trim();
}

export async function completeJson<T>(options: CompleteChatOptions): Promise<T> {
  const text = await completeChat(options);
  return parseModelJson<T>(text);
}

export function parseModelJson<T>(text: string): T {
  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw new ServiceError("MODEL_JSON_ERROR", "Model response was not valid JSON", 502, {
      response: text,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
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
  const printable = cleanExtractedPdfText(literalStrings.join(" "));
  if (isUsefulExtractedPdfText(printable)) return printable;

  const rawPrintable = cleanExtractedPdfText(raw);
  return isUsefulExtractedPdfText(rawPrintable) ? rawPrintable : "";
}

function cleanExtractedPdfText(value: string): string {
  return value
    .replace(/\\[rn]/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulExtractedPdfText(value: string): boolean {
  const words = value.match(/[A-Za-z]{3,}/g) ?? [];
  if (words.length < 4) return false;
  const letters = value.match(/[A-Za-z]/g)?.length ?? 0;
  return letters / Math.max(value.length, 1) > 0.35;
}

export function createAgentApp(options: {
  name: string;
  description: string;
  handler: AgentHandler;
  bodyLimitBytes?: number;
}): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: options.bodyLimitBytes ?? internalJsonBodyLimitBytes()
  });

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

function internalJsonBodyLimitBytes(): number {
  const configured = Number(process.env.AGENT_BODY_LIMIT_BYTES ?? process.env.INTERNAL_JSON_BODY_LIMIT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 20 * 1024 * 1024;
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

function modelUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) return fenced;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}
