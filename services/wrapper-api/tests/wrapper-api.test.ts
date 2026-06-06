import { describe, expect, it, vi } from "vitest";
import { buildWrapperApi, type WrapperConfig } from "../src/app.js";

const config: WrapperConfig = {
  allowedOrigins: ["http://localhost:3000"],
  masterAgentUrl: "http://master-agent",
  modelCatalog: {
    allowedAgentNames: ["ai/gpt-oss:latest", "ai/gemma4:31B"],
    allowedOcrNames: ["ai/qwen3-vl:latest"],
    availableNames: ["ai/gpt-oss:latest", "ai/gemma4:31B", "ai/qwen3-vl:latest", "ai/mxbai-embed-large:latest"],
    defaultAgentName: "ai/gpt-oss:latest",
    defaultOcrName: "ai/qwen3-vl:latest"
  }
};

describe("wrapper API", () => {
  it("returns separate OCR and agent model dropdown catalogs", async () => {
    const app = await buildWrapperApi(config);
    const response = await app.inject("/api/v1/models");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.dropdowns.ocr.models.map((model: { name: string }) => model.name)).toEqual(["ai/qwen3-vl:latest"]);
    expect(body.dropdowns.agent.models.map((model: { name: string }) => model.name)).toEqual([
      "ai/gpt-oss:latest",
      "ai/gemma4:31B"
    ]);
    expect(body.dropdowns.agent.models.some((model: { name: string }) => model.name.includes("embed"))).toBe(false);
    await app.close();
  });

  it("rejects models submitted to the wrong dropdown field", async () => {
    const app = await buildWrapperApi(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/question",
      payload: {
        question: "What is the premium?",
        documentScope: "minimum",
        fetchStrategy: "latest",
        selectedOcrModelName: "ai/gpt-oss:latest",
        selectedAgentModelName: "ai/gpt-oss:latest"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("MODEL_NOT_ALLOWED");
    await app.close();
  });

  it("forwards valid chat questions to the master agent", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({
          answer: "The premium is 1250 dollars.",
          citations: [],
          sourceHandleIds: [],
          selectedOcrModelName: "ai/qwen3-vl:latest",
          ocrModelUsedName: "ai/qwen3-vl:latest",
          selectedAgentModelName: "ai/gpt-oss:latest",
          agentModelUsedName: "ai/gpt-oss:latest",
          routeTaken: ["wrapper-api", "master-agent"],
          additionalDmsFetchOccurred: false
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const app = await buildWrapperApi(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/chat/question",
      payload: {
        question: "What is the premium?",
        documentScope: "minimum",
        fetchStrategy: "latest",
        selectedOcrModelName: "ai/qwen3-vl:latest",
        selectedAgentModelName: "ai/gpt-oss:latest"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().answer).toContain("1250");

    await app.close();
    vi.stubGlobal("fetch", originalFetch);
  });
});
