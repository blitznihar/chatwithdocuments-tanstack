import {
  chatQuestionSchema,
  type ChatQuestionRequest,
  type ChatQuestionResponse,
  type DocumentMetadata,
  type DocumentQueryResponse,
  type McpFetchResponse,
  type VectorChunk
} from "@doc-ai/api-contracts";
import { invokeAgent, postJson } from "@doc-ai/agent-runtime";

export type MasterAgentClients = {
  answerAgentUrl: string;
  fetchDocumentAgentUrl: string;
  metadataAgentUrl: string;
  ocrAgentUrl: string;
  vectorIngestionAgentUrl: string;
  vectorMcpUrl: string;
};

type OcrOutput = {
  handleId: string;
  text: string;
  ocrModelUsedName: string;
};

type AnswerOutput = {
  answer: string;
  citations: ChatQuestionResponse["citations"];
  sourceHandleIds: string[];
  agentModelUsedName: string;
};

export async function orchestrateQuestion(
  rawRequest: ChatQuestionRequest,
  clients: MasterAgentClients
): Promise<ChatQuestionResponse> {
  const request = chatQuestionSchema.parse(rawRequest);
  const routeTaken = ["wrapper-api", "master-agent", "vector-first"];

  let vectorChunks = await searchVector(clients.vectorMcpUrl, request);
  let additionalDmsFetchOccurred = false;

  if (request.fetchStrategy !== "vector-only" && (request.fetchStrategy === "latest" || vectorChunks.length === 0)) {
    routeTaken.push("metadata-agent");
    const metadataResponse = await invokeAgent<DocumentQueryResponse>(clients.metadataAgentUrl, {
      policyNumber: request.policyNumber,
      customerId: request.customerId,
      documentType: request.documentType,
      limit: request.documentScope === "all" ? 25 : 1
    });
    const selectedDocuments = selectDocuments(metadataResponse.documents, request.documentScope);

    if (selectedDocuments.length > 0) {
      additionalDmsFetchOccurred = true;
      routeTaken.push("fetch-document-agent", "ocr-agent", "vector-ingestion-agent");
    }

    const ocrDocuments = [];
    for (const metadata of selectedDocuments) {
      const fetched = await invokeAgent<McpFetchResponse>(clients.fetchDocumentAgentUrl, {
        handleId: metadata.handleId
      });
      const ocr = await invokeAgent<OcrOutput>(clients.ocrAgentUrl, {
        handleId: fetched.handleId,
        pdfBase64: fetched.pdfBase64,
        selectedOcrModelName: request.selectedOcrModelName
      });
      ocrDocuments.push({
        handleId: fetched.handleId,
        metadata,
        text: ocr.text
      });
    }

    if (ocrDocuments.length > 0) {
      await invokeAgent(clients.vectorIngestionAgentUrl, {
        documents: ocrDocuments
      });
      vectorChunks = await searchVector(clients.vectorMcpUrl, {
        ...request,
        handleIds: ocrDocuments.map((document) => document.handleId)
      });
    }
  }

  routeTaken.push("answer-agent");
  const answer = await invokeAgent<AnswerOutput>(clients.answerAgentUrl, {
    question: request.question,
    policyNumber: request.policyNumber,
    selectedAgentModelName: request.selectedAgentModelName,
    chunks: vectorChunks
  });

  return {
    answer: answer.answer,
    citations: answer.citations,
    sourceHandleIds: answer.sourceHandleIds,
    selectedOcrModelName: request.selectedOcrModelName,
    ocrModelUsedName: request.selectedOcrModelName,
    selectedAgentModelName: request.selectedAgentModelName,
    agentModelUsedName: answer.agentModelUsedName,
    routeTaken,
    additionalDmsFetchOccurred
  };
}

async function searchVector(
  vectorMcpUrl: string,
  request: ChatQuestionRequest & { handleIds?: string[] }
): Promise<VectorChunk[]> {
  const response = await postJson<{ chunks: VectorChunk[] }>(`${vectorMcpUrl}/api/v1/tools/search-chunks`, {
    question: request.question,
    policyNumber: request.policyNumber,
    handleIds: request.handleIds,
    limit: 5
  });
  return response.chunks;
}

function selectDocuments(documents: DocumentMetadata[], scope: "minimum" | "all"): DocumentMetadata[] {
  return scope === "minimum" ? documents.slice(0, 1) : documents;
}
