import { z } from "zod";

export const documentStatusSchema = z.enum(["ACTIVE", "DELETED"]);

export const documentMetadataSchema = z.object({
  handleId: z.string().min(1),
  policyNumber: z.string().min(1),
  documentType: z.string().min(1),
  customerId: z.string().optional(),
  beneficiaryId: z.string().optional(),
  sourceSystem: z.string().default("LOCAL_DMS_UI"),
  originalFilename: z.string().min(1),
  mimeType: z.string().default("application/pdf"),
  sizeBytes: z.number().int().nonnegative(),
  status: documentStatusSchema.default("ACTIVE"),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional()
});

export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;

export const documentQuerySchema = z.object({
  policyNumber: z.string().optional(),
  documentType: z.string().optional(),
  customerId: z.string().optional(),
  beneficiaryId: z.string().optional(),
  updatedAfter: z.string().optional(),
  includeDeleted: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export type DocumentQuery = z.infer<typeof documentQuerySchema>;

export const documentQueryResponseSchema = z.object({
  documents: z.array(documentMetadataSchema),
  count: z.number().int().nonnegative()
});

export type DocumentQueryResponse = z.infer<typeof documentQueryResponseSchema>;

export const uploadDocumentResponseSchema = z.object({
  handleId: z.string(),
  metadata: documentMetadataSchema
});

export type UploadDocumentResponse = z.infer<typeof uploadDocumentResponseSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional()
  })
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const modelOptionSchema = z.object({
  name: z.string(),
  label: z.string(),
  capabilities: z.array(z.string()),
  default: z.boolean().optional()
});

export const modelCatalogSchema = z.object({
  defaults: z.object({
    ocrModelName: z.string(),
    agentModelName: z.string()
  }),
  dropdowns: z.object({
    ocr: z.object({
      label: z.string(),
      models: z.array(modelOptionSchema)
    }),
    agent: z.object({
      label: z.string(),
      models: z.array(modelOptionSchema)
    })
  }),
  availableModels: z.array(modelOptionSchema)
});

export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
export type ModelOption = z.infer<typeof modelOptionSchema>;

export const chatQuestionSchema = z.object({
  question: z.string().min(1),
  policyNumber: z.string().optional(),
  customerId: z.string().optional(),
  documentType: z.string().optional(),
  documentScope: z.enum(["minimum", "all"]).default("minimum"),
  fetchStrategy: z.enum(["vector-only", "delta-only", "latest"]).default("latest"),
  selectedOcrModelName: z.string().min(1),
  selectedAgentModelName: z.string().min(1)
});

export type ChatQuestionRequest = z.infer<typeof chatQuestionSchema>;

export const citationSchema = z.object({
  handleId: z.string(),
  documentType: z.string().optional(),
  policyNumber: z.string().optional(),
  excerpt: z.string()
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(citationSchema),
  sourceHandleIds: z.array(z.string()),
  selectedOcrModelName: z.string(),
  ocrModelUsedName: z.string(),
  selectedAgentModelName: z.string(),
  agentModelUsedName: z.string(),
  routeTaken: z.array(z.string()),
  additionalDmsFetchOccurred: z.boolean()
});

export type ChatQuestionResponse = z.infer<typeof chatResponseSchema>;
export type Citation = z.infer<typeof citationSchema>;

export const mcpQueryInputSchema = documentQuerySchema;

export const mcpFetchInputSchema = z.object({
  handleId: z.string().min(1)
});

export const mcpFetchResponseSchema = z.object({
  handleId: z.string(),
  metadata: documentMetadataSchema,
  pdfBase64: z.string()
});

export type McpFetchResponse = z.infer<typeof mcpFetchResponseSchema>;

export const vectorChunkSchema = z.object({
  chunkId: z.string(),
  handleId: z.string(),
  policyNumber: z.string().optional(),
  documentType: z.string().optional(),
  text: z.string(),
  sourceSystem: z.string().optional(),
  updatedAt: z.string().optional()
});

export type VectorChunk = z.infer<typeof vectorChunkSchema>;

export const a2aInvokeSchema = z.object({
  taskId: z.string().optional(),
  input: z.record(z.unknown())
});

export type A2AInvoke = z.infer<typeof a2aInvokeSchema>;

export const a2aResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum(["completed", "failed"]),
  output: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string()
    })
    .optional()
});

export type A2AResponse = z.infer<typeof a2aResponseSchema>;

const friendlyModelLabels: Record<string, string> = {
  "ai/gpt-oss:latest": "GPT OSS Latest",
  "ai/ministral3:14B": "Ministral 3 14B",
  "ai/qwen3-vl:latest": "Qwen 3 VL Latest",
  "ai/gemma4:latest": "Gemma 4 Latest",
  "ai/gemma4:31B": "Gemma 4 31B",
  "ai/mxbai-embed-large:latest": "MxBai Embed Large",
  "ai/nomic-embed-text-v1.5": "Nomic Embed Text v1.5"
};

export function modelLabel(name: string): string {
  return friendlyModelLabels[name] ?? name.replace(/^ai\//, "").replace(/[:_-]/g, " ");
}

export function modelCapabilities(name: string): string[] {
  if (name.includes("qwen3-vl")) return ["ocr", "vision", "document-understanding"];
  if (name.includes("embed") || name.includes("nomic")) return ["embedding"];
  return ["chat", "reasoning", "answer-generation"];
}
