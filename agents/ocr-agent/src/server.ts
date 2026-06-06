import { createAgentApp, extractPdfTextFromBase64 } from "@doc-ai/agent-runtime";
import { envNumber } from "@doc-ai/shared-config";

const port = envNumber("OCR_AGENT_PORT", 3304);

const app = createAgentApp({
  name: "ocr-agent",
  description: "Extracts searchable text from fetched PDFs",
  handler: async (input) => {
    const pdfBase64 = String(input.pdfBase64 ?? "");
    const selectedOcrModelName = String(input.selectedOcrModelName ?? "ai/qwen3-vl:latest");
    const text = extractPdfTextFromBase64(pdfBase64);
    return {
      handleId: String(input.handleId ?? ""),
      text,
      selectedOcrModelName,
      ocrModelUsedName: selectedOcrModelName
    };
  }
});

await app.listen({ host: "0.0.0.0", port });
