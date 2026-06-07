import { completeChat, createAgentApp, postJson } from "@doc-ai/agent-runtime";
import { envNumber, envOptionalString, envString } from "@doc-ai/shared-config";
import { type Citation, type VectorChunk } from "@doc-ai/api-contracts";

const port = envNumber("ANSWER_AGENT_PORT", 3306);
const vectorMcpUrl = envString("VECTOR_MCP_URL", "http://localhost:3403");
const modelBaseUrl = envString("MODEL_BASE_URL", "http://host.docker.internal:12434/engines/v1");
const modelApiKey = envOptionalString("MODEL_API_KEY");
const fallbackAgentModelName = envString("MODEL_FALLBACK_AGENT_NAME", "ai/gemma4:latest");
const modelFallbackEnabled = envOptionalString("MODEL_ALLOW_FALLBACK") !== "false";

const app = createAgentApp({
  name: "answer-agent",
  description: "Answers questions from retrieved vector chunks and returns citations",
  handler: async (input) => {
    const question = String(input.question ?? "");
    const selectedAgentModelName = String(input.selectedAgentModelName ?? "ai/gpt-oss:latest");
    let chunks = (input.chunks ?? []) as VectorChunk[];
    if (!chunks.length) {
      const search = await postJson<{ chunks: VectorChunk[] }>(`${vectorMcpUrl}/api/v1/tools/search-chunks`, {
        question,
        policyNumber: input.policyNumber
      });
      chunks = search.chunks;
    }

    const citations: Citation[] = chunks.map((chunk) => ({
      handleId: chunk.handleId,
      documentType: chunk.documentType,
      policyNumber: chunk.policyNumber,
      excerpt: chunk.text.slice(0, 240)
    }));

    const answerResult = chunks.length
      ? await generateGroundedAnswer(question, chunks, selectedAgentModelName)
      : {
          answer: "I could not find indexed document content that supports an answer yet.",
          modelUsed: selectedAgentModelName
        };

    return {
      answer: answerResult.answer,
      citations,
      sourceHandleIds: [...new Set(chunks.map((chunk) => chunk.handleId))],
      agentModelUsedName: answerResult.modelUsed
    };
  }
});

await app.listen({ host: "0.0.0.0", port });

async function generateGroundedAnswer(
  question: string,
  chunks: VectorChunk[],
  selectedModel: string
): Promise<{ answer: string; modelUsed: string }> {
  try {
    return {
      answer: await completeGroundedAnswer(question, chunks, selectedModel),
      modelUsed: selectedModel
    };
  } catch (error) {
    if (!shouldFallbackToAgentModel(error, selectedModel)) throw error;
    return {
      answer: await completeGroundedAnswer(question, chunks, fallbackAgentModelName),
      modelUsed: fallbackAgentModelName
    };
  }
}

async function completeGroundedAnswer(question: string, chunks: VectorChunk[], model: string): Promise<string> {
  return completeChat({
    baseUrl: modelBaseUrl,
    apiKey: modelApiKey,
    model,
    temperature: 0.1,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content: [
          "You answer questions about document management system records.",
          "Use only the supplied document chunks.",
          "If the chunks do not contain enough evidence, say that the available documents do not support an answer.",
          "Keep the answer concise and do not fabricate policy details.",
          "Return plain text only. Do not use Markdown, bold formatting, asterisks, bullets, or code formatting.",
          "For multi-part questions, answer the direct facts first in one or two short sentences.",
          "If timeline or history is requested, add a line that says Timeline and History: followed by one event per line."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          question,
          chunks: chunks.map((chunk) => ({
            handleId: chunk.handleId,
            policyNumber: chunk.policyNumber,
            documentType: chunk.documentType,
            updatedAt: chunk.updatedAt,
            text: chunk.text
          }))
        })
      }
    ]
  }).then(stripMarkdownEmphasis);
}

function shouldFallbackToAgentModel(error: unknown, selectedModel: string): boolean {
  return modelFallbackEnabled && selectedModel !== fallbackAgentModelName && modelErrorCode(error) === "MODEL_API_ERROR";
}

function modelErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function stripMarkdownEmphasis(value: string): string {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .trim();
}
