import {
  chatQuestionSchema,
  type ChatQuestionRequest,
  type ChatQuestionResponse,
  type DocumentMetadata,
  type DocumentQueryResponse,
  type McpFetchResponse,
  type VectorChunk
} from "@doc-ai/api-contracts";
import { completeJson, invokeAgent, postJson } from "@doc-ai/agent-runtime";
import { ServiceError } from "@doc-ai/shared-errors";

export type MasterAgentClients = {
  answerAgentUrl: string;
  fetchDocumentAgentUrl: string;
  metadataAgentUrl: string;
  modelApiKey?: string;
  modelBaseUrl: string;
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

type RetrievalPlan = {
  vectorContentIsSufficient: boolean;
  needsDmsMetadata: boolean;
  metadataFilters: {
    policyNumber?: string;
    customerId?: string;
    documentType?: string;
  };
  reason: string;
};

export async function orchestrateQuestion(
  rawRequest: ChatQuestionRequest,
  clients: MasterAgentClients
): Promise<ChatQuestionResponse> {
  const request = chatQuestionSchema.parse(rawRequest);
  const routeTaken = ["wrapper-api", "master-agent", "vector-first"];

  let vectorChunks = await searchVector(clients.vectorMcpUrl, request);
  let additionalDmsFetchOccurred = false;
  let ocrModelUsedName = request.selectedOcrModelName;

  routeTaken.push("agent-model-retrieval-plan");
  const retrievalPlan = await planRetrieval(request, vectorChunks, clients);

  if (shouldFetchFromDms(request, retrievalPlan)) {
    routeTaken.push("metadata-agent");
    const fetchAllRelevantDocuments = shouldFetchAllRelevantDocuments(request);
    const metadataResponse = await invokeAgent<DocumentQueryResponse>(clients.metadataAgentUrl, {
      ...metadataFiltersFor(request, retrievalPlan),
      limit: fetchAllRelevantDocuments ? 25 : 1
    });
    const selectedDocuments = selectDocuments(metadataResponse.documents, fetchAllRelevantDocuments);

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
        metadata: fetched.metadata,
        pdfBase64: fetched.pdfBase64,
        selectedOcrModelName: request.selectedOcrModelName
      });
      ocrModelUsedName = ocr.ocrModelUsedName || ocrModelUsedName;
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
    ocrModelUsedName,
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
    limit: 12
  });
  return response.chunks;
}

async function planRetrieval(
  request: ChatQuestionRequest,
  chunks: VectorChunk[],
  clients: MasterAgentClients
): Promise<RetrievalPlan> {
  if (request.fetchStrategy === "latest") {
    return deterministicRetrievalPlan(request, chunks, "Latest content was requested, so DMS retrieval is required.");
  }

  try {
    const rawPlan = await completeJson<Partial<RetrievalPlan>>({
      baseUrl: clients.modelBaseUrl,
      apiKey: clients.modelApiKey,
      model: request.selectedAgentModelName,
      temperature: 0,
      maxTokens: 400,
      messages: [
        {
          role: "system",
          content: [
            "You are the master routing planner for a document AI system.",
            "Decide whether the retrieved vector chunks are sufficient to answer the user's question, or whether DMS metadata/PDF retrieval is needed first.",
            "Return only a compact JSON object with keys: vectorContentIsSufficient, needsDmsMetadata, metadataFilters, reason.",
            "metadataFilters may include policyNumber, customerId, and documentType only when explicitly provided or clearly present in the question.",
            "Do not invent document facts. If context is missing, stale, unrelated, or too thin, mark it insufficient."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            question: request.question,
            selectedFetchStrategy: request.fetchStrategy,
            selectedDocumentScope: request.documentScope,
            explicitFilters: {
              policyNumber: request.policyNumber,
              customerId: request.customerId,
              documentType: request.documentType
            },
            vectorChunks: chunks.map((chunk) => ({
              handleId: chunk.handleId,
              policyNumber: chunk.policyNumber,
              documentType: chunk.documentType,
              updatedAt: chunk.updatedAt,
              text: chunk.text.slice(0, 900)
            }))
          })
        }
      ]
    });

    return normalizeRetrievalPlan(rawPlan);
  } catch (error) {
    if (!isPlannerModelFailure(error)) throw error;
    return deterministicRetrievalPlan(request, chunks, "The model retrieval planner failed, so routing used deterministic fallback logic.");
  }
}

function deterministicRetrievalPlan(
  request: ChatQuestionRequest,
  chunks: VectorChunk[],
  reason: string
): RetrievalPlan {
  const vectorContentIsSufficient = chunks.length > 0 && request.fetchStrategy === "vector-only";
  return {
    vectorContentIsSufficient,
    needsDmsMetadata: request.fetchStrategy !== "vector-only" && !vectorContentIsSufficient,
    metadataFilters: {
      policyNumber: request.policyNumber,
      customerId: request.customerId,
      documentType: request.documentType
    },
    reason
  };
}

function isPlannerModelFailure(error: unknown): boolean {
  return (
    error instanceof ServiceError &&
    ["MODEL_API_ERROR", "MODEL_JSON_ERROR", "MODEL_DECISION_INVALID"].includes(error.code)
  );
}

function normalizeRetrievalPlan(rawPlan: Partial<RetrievalPlan>): RetrievalPlan {
  if (!rawPlan || typeof rawPlan !== "object") {
    throw new ServiceError("MODEL_DECISION_INVALID", "Model retrieval plan was not an object", 502, rawPlan);
  }

  return {
    vectorContentIsSufficient: requiredBoolean(rawPlan.vectorContentIsSufficient, "vectorContentIsSufficient", rawPlan),
    needsDmsMetadata: requiredBoolean(rawPlan.needsDmsMetadata, "needsDmsMetadata", rawPlan),
    metadataFilters: normalizeMetadataFilters(rawPlan.metadataFilters),
    reason: typeof rawPlan.reason === "string" ? rawPlan.reason : ""
  };
}

function requiredBoolean(value: unknown, field: string, rawPlan: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ServiceError("MODEL_DECISION_INVALID", `Model retrieval plan omitted boolean field ${field}`, 502, rawPlan);
}

function normalizeMetadataFilters(value: unknown): RetrievalPlan["metadataFilters"] {
  if (!value || typeof value !== "object") return {};
  const filters = value as Record<string, unknown>;
  return {
    policyNumber: optionalString(filters.policyNumber),
    customerId: optionalString(filters.customerId),
    documentType: optionalString(filters.documentType)
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shouldFetchFromDms(request: ChatQuestionRequest, plan: RetrievalPlan): boolean {
  if (request.fetchStrategy === "vector-only") return false;
  if (request.fetchStrategy === "latest") return true;
  return plan.needsDmsMetadata || !plan.vectorContentIsSufficient;
}

function metadataFiltersFor(
  request: ChatQuestionRequest,
  plan: RetrievalPlan
): Pick<ChatQuestionRequest, "policyNumber" | "customerId" | "documentType"> {
  return {
    policyNumber: request.policyNumber ?? plan.metadataFilters.policyNumber,
    customerId: request.customerId ?? plan.metadataFilters.customerId,
    documentType: request.documentType ?? plan.metadataFilters.documentType
  };
}

function selectDocuments(documents: DocumentMetadata[], allRelevantDocuments: boolean): DocumentMetadata[] {
  return allRelevantDocuments ? documents : documents.slice(0, 1);
}

function shouldFetchAllRelevantDocuments(request: ChatQuestionRequest): boolean {
  if (request.documentScope === "all") return true;
  return /\b(all|complete|full|timeline|timelines|history|historical|payment history|payments|receipts|transactions)\b/i.test(
    request.question
  );
}
