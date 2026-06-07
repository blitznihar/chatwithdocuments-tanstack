import { describe, expect, it, vi } from "vitest";
import { orchestrateQuestion, type MasterAgentClients } from "../src/orchestrator.js";

describe("master agent orchestration", () => {
  it("uses deterministic DMS routing without a planner model call when latest content is requested", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("vector") && String(url).includes("search-chunks")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return json({ chunks: body.handleIds ? [{ chunkId: "c1", handleId: "HDL-1", text: "premium is 1250 dollars" }] : [] });
      }
      if (String(url).includes("models/chat/completions")) {
        return json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  vectorContentIsSufficient: false,
                  needsDmsMetadata: true,
                  metadataFilters: { policyNumber: "POL-1001" },
                  reason: "No indexed chunks were available before fetching latest DMS content."
                })
              }
            }
          ]
        });
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
      modelBaseUrl: "http://models",
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
    expect(response.routeTaken).toContain("agent-model-retrieval-plan");
    expect(response.routeTaken).toContain("metadata-agent");
    expect(response.sourceHandleIds).toEqual(["HDL-1"]);
    expect(calls.some((call) => call.includes("models/chat/completions"))).toBe(false);
    expect(calls.some((call) => call.includes("metadata/a2a/invoke"))).toBe(true);

    vi.stubGlobal("fetch", originalFetch);
  });

  it("expands minimum scope when the question asks for complete history", async () => {
    const fetchInputs: Record<string, unknown>[] = [];
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (String(url).includes("vector") && String(url).includes("search-chunks")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return json({
          chunks: body.handleIds?.length
            ? body.handleIds.map((handleId: string) => ({ chunkId: `${handleId}-0`, handleId, text: "premium history" }))
            : []
        });
      }
      if (String(url).includes("metadata/a2a/invoke")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        fetchInputs.push(body.input);
        return json({
          taskId: "metadata",
          status: "completed",
          output: {
            documents: [metadata("HDL-1"), metadata("HDL-2")],
            count: 2
          }
        });
      }
      if (String(url).includes("fetch/a2a/invoke")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        fetchInputs.push(body.input);
        return json({
          taskId: "fetch",
          status: "completed",
          output: {
            handleId: body.input.handleId,
            metadata: metadata(body.input.handleId),
            pdfBase64: Buffer.from("%PDF-1.4 (premium history)").toString("base64")
          }
        });
      }
      if (String(url).includes("ocr/a2a/invoke")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return json({
          taskId: "ocr",
          status: "completed",
          output: { handleId: body.input.handleId, text: "premium history", ocrModelUsedName: "ai/qwen3-vl:latest" }
        });
      }
      if (String(url).includes("ingest/a2a/invoke")) {
        return json({ taskId: "ingest", status: "completed", output: { upserted: 2 } });
      }
      if (String(url).includes("answer/a2a/invoke")) {
        return json({
          taskId: "answer",
          status: "completed",
          output: {
            answer: "History answer.",
            citations: [],
            sourceHandleIds: ["HDL-1", "HDL-2"],
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
      modelBaseUrl: "http://models",
      ocrAgentUrl: "http://ocr",
      vectorIngestionAgentUrl: "http://ingest",
      vectorMcpUrl: "http://vector"
    };

    const response = await orchestrateQuestion(
      {
        question: "Provide all timelines and history for this policy",
        policyNumber: "POL-1001",
        documentScope: "minimum",
        fetchStrategy: "latest",
        selectedOcrModelName: "ai/qwen3-vl:latest",
        selectedAgentModelName: "ai/gpt-oss:latest"
      },
      clients
    );

    expect(fetchInputs[0]).toMatchObject({ limit: 25 });
    expect(fetchInputs.filter((input) => "handleId" in input)).toHaveLength(2);
    expect(response.sourceHandleIds).toEqual(["HDL-1", "HDL-2"]);

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

function metadata(handleId: string) {
  return {
    handleId,
    policyNumber: "POL-1001",
    documentType: "POLICY",
    sourceSystem: "LOCAL_DMS_UI",
    originalFilename: `${handleId}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 123,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
}
