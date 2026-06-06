import { createAgentApp, postJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";
import { type Citation, type VectorChunk } from "@doc-ai/api-contracts";

const port = envNumber("ANSWER_AGENT_PORT", 3306);
const vectorMcpUrl = envString("VECTOR_MCP_URL", "http://localhost:3403");

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

    const answer = chunks.length
      ? `Based on ${chunks.length} indexed document chunk${chunks.length === 1 ? "" : "s"}, ${summarize(question, chunks)}`
      : "I could not find indexed document content that supports an answer yet.";

    return {
      answer,
      citations,
      sourceHandleIds: [...new Set(chunks.map((chunk) => chunk.handleId))],
      agentModelUsedName: selectedAgentModelName
    };
  }
});

await app.listen({ host: "0.0.0.0", port });

function summarize(question: string, chunks: VectorChunk[]): string {
  const combined = chunks.map((chunk) => chunk.text).join(" ");
  const premium = combined.match(/premium\s+is\s+([0-9,.$ ]+)/i)?.[1]?.trim();
  if (/premium|amount|cost/i.test(question) && premium) {
    return `the premium appears to be ${premium}.`;
  }
  return `${combined.slice(0, 300)}${combined.length > 300 ? "..." : ""}`;
}
