import type { DocumentMetadata, DocumentQueryResponse, UploadDocumentResponse } from "@doc-ai/api-contracts";

const dmsApiUrl = import.meta.env.VITE_DMS_API_URL ?? "http://localhost:3101";

export type UploadFormValues = {
  beneficiaryId?: string;
  customerId?: string;
  documentType: string;
  file: File;
  policyNumber: string;
  sourceSystem: string;
};

export async function uploadDocument(values: UploadFormValues): Promise<UploadDocumentResponse> {
  const form = new FormData();
  form.set("policyNumber", values.policyNumber);
  form.set("documentType", values.documentType);
  form.set("sourceSystem", values.sourceSystem);
  if (values.customerId) form.set("customerId", values.customerId);
  if (values.beneficiaryId) form.set("beneficiaryId", values.beneficiaryId);
  form.set("file", values.file);
  return request("/api/v1/documents", {
    method: "POST",
    body: form
  });
}

export async function queryDocuments(params: Record<string, string>): Promise<DocumentQueryResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return request(`/api/v1/documents?${query.toString()}`);
}

export async function getDocument(handleId: string): Promise<DocumentMetadata> {
  return request(`/api/v1/documents/${encodeURIComponent(handleId)}`);
}

export async function getHealth(): Promise<unknown> {
  return request("/health/ready");
}

export function fileUrl(handleId: string): string {
  return `${dmsApiUrl}/api/v1/documents/${encodeURIComponent(handleId)}/file`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${dmsApiUrl}${path}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  const parsed = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = parsed?.error?.message ?? `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return parsed as T;
}
