import { describe, expect, it, vi } from "vitest";
import { orchestrateQuestion, type MasterAgentClients } from "../src/orchestrator.js";

describe("master agent orchestration", () => {
  it("uses vector-first routing and fetches through agents when latest content is requested", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("vector") && String(url).includes("search-chunks")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return json({ chunks: body.handleIds ? [{ chunkId: "c1", handleId: "HDL-1", text: "premium is 1250 dollars" }] : [] });
      }
      if (String(url).includes("metadata/a2a/invoke")) {
        return json({
          taskId: "t1",
          status: "completed",
          output: {
            documents: [
              {
                handleId: "HDL-1",
                policyNumber: "POL-1001",
                documentType: "POLICY",
                sourceSystem: "LOCAL_DMS_UI",
                originalFilename: "sample.pdf",
                mimeType: "application/pdf",
                sizeBytes: 123,
                status: "ACTIVE",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null
              }
            ],
            count: 1
          }
        });
      }
      if (String(url).includes("fetch/a2a/invoke")) {
        return json({
          taskId: "t2",
          status: "completed",
          output: {
            handleId: "HDL-1",
            metadata: {},
            pdfBase64: Buffer.from("%PDF-1.4 (premium is 1250 dollars)").toString("base64")
          }
        });
      }
      if (String(url).includes("ocr/a2a/invoke")) {
        return json({
          taskId: "t3",
          status: "completed",
          output: { handleId: "HDL-1", text: "premium is 1250 dollars", ocrModelUsedName: "ai/qwen3-vl:latest" }
        });
      }
      if (String(url).includes("ingest/a2a/invoke")) {
        return json({ taskId: "t4", status: "completed", output: { upserted: 1 } });
      }
      if (String(url).includes("answer/a2a/invoke")) {
        return json({
          taskId: "t5",
          status: "completed",
          output: {
            answer: "The premium appears to be 1250 dollars.",
            citations: [{ handleId: "HDL-1", excerpt: "premium is 1250 dollars" }],
            sourceHandleIds: ["HDL-1"],
            agentModelUsedName: "ai/gpt-oss:latest"
          }
        });
      }
      return json({}, 404);
    });

    const clients: MasterAgentClients = {
      answerAgentUrl: "http://answer",
      fetchDocumentAgentUrl: "http://fetch",
      metadataAgentUrl: "http://metadata",
      ocrAgentUrl: "http://ocr",
      vectorIngestionAgentUrl: "http://ingest",
      vectorMcpUrl: "http://vector"
    };

    const response = await orchestrateQuestion(
      {
        question: "What is the premium?",
        policyNumber: "POL-1001",
        documentScope: "minimum",
        fetchStrategy: "latest",
        selectedOcrModelName: "ai/qwen3-vl:latest",
        selectedAgentModelName: "ai/gpt-oss:latest"
      },
      clients
    );

    expect(response.additionalDmsFetchOccurred).toBe(true);
    expect(response.routeTaken).toContain("metadata-agent");
    expect(response.sourceHandleIds).toEqual(["HDL-1"]);
    expect(calls.some((call) => call.includes("metadata/a2a/invoke"))).toBe(true);

    vi.stubGlobal("fetch", originalFetch);
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
