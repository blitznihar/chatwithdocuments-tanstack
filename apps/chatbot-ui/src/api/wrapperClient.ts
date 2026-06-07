import type { ChatQuestionRequest, ChatQuestionResponse, ModelCatalog } from "@doc-ai/api-contracts";

const wrapperApiUrl = import.meta.env.VITE_WRAPPER_API_URL ?? "http://localhost:3201";
const dmsUiUrl = import.meta.env.VITE_DMS_UI_URL ?? "http://localhost:3102";

export function documentViewUrl(handleId: string): string {
  return `${dmsUiUrl.replace(/\/+$/, "")}/documents/${encodeURIComponent(handleId)}`;
}

export async function getModelCatalog(): Promise<ModelCatalog> {
  return request("/api/v1/models");
}

export async function askQuestion(question: ChatQuestionRequest): Promise<ChatQuestionResponse> {
  return request("/api/v1/chat/question", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(question)
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${wrapperApiUrl}${path}`, init);
  const parsed = await response.json();
  if (!response.ok) {
    throw new Error(parsed?.error?.message ?? `Request failed with ${response.status}`);
  }
  return parsed as T;
}
