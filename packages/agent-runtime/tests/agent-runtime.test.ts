import { describe, expect, it } from "vitest";
import { createAgentApp, extractPdfTextFromBase64 } from "../src/index.js";

describe("agent runtime", () => {
  it("accepts internal A2A payloads larger than Fastify's default body limit", async () => {
    const app = createAgentApp({
      name: "large-body-agent",
      description: "Test agent",
      handler: async (input) => ({ receivedBytes: String(input.pdfBase64 ?? "").length })
    });

    const pdfBase64 = "x".repeat(1_500_000);
    const response = await app.inject({
      method: "POST",
      url: "/a2a/invoke",
      payload: {
        taskId: "large-body-test",
        input: { pdfBase64 }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      taskId: "large-body-test",
      status: "completed",
      output: { receivedBytes: pdfBase64.length }
    });

    await app.close();
  });

  it("does not return binary-looking PDF bytes as extracted text", () => {
    const noisyPdf = Buffer.from("%PDF-1.3\nstream\n\u0000\u0001\u0002\u0080\u0090\u00ff\u0003\u0004\u0005\nendstream", "latin1");

    expect(extractPdfTextFromBase64(noisyPdf.toString("base64"))).toBe("");
  });

  it("keeps readable text from simple literal PDF strings", () => {
    const readablePdf = Buffer.from("%PDF-1.4 (Premium is 1250 dollars monthly for policy)", "latin1");

    expect(extractPdfTextFromBase64(readablePdf.toString("base64"))).toBe(
      "Premium is 1250 dollars monthly for policy"
    );
  });
});
