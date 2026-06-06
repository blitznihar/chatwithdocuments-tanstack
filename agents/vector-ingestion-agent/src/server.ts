import { chunkText, createAgentApp, postJson } from "@doc-ai/agent-runtime";
import { envNumber, envString } from "@doc-ai/shared-config";
import { type DocumentMetadata, type VectorChunk } from "@doc-ai/api-contracts";

const port = envNumber("VECTOR_INGESTION_AGENT_PORT", 3305);
const vectorMcpUrl = envString("VECTOR_MCP_URL", "http://localhost:3403");

type IngestDocument = {
  handleId: string;
  metadata: DocumentMetadata;
  text: string;
};

const app = createAgentApp({
  name: "vector-ingestion-agent",
  description: "Chunks OCR text and writes derived content through the Vector MCP wrapper",
  handler: async (input) => {
    const documents = (input.documents ?? []) as IngestDocument[];
    const chunks: VectorChunk[] = documents.flatMap((document) =>
      chunkText(document.text).map((text, index) => ({
        chunkId: `${document.handleId}-${index}`,
        handleId: document.handleId,
        policyNumber: document.metadata.policyNumber,
        documentType: document.metadata.documentType,
        text,
        sourceSystem: document.metadata.sourceSystem,
        updatedAt: document.metadata.updatedAt
      }))
    );
    const result = await postJson<{ upserted: number; total: number }>(`${vectorMcpUrl}/api/v1/tools/upsert-chunks`, {
      chunks
    });
    return {
      ...result,
      chunks
    };
  }
});

await app.listen({ host: "0.0.0.0", port });
