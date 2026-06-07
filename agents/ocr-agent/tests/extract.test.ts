import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractTextFromHtml } from "../src/extract.js";

describe("OCR extraction helpers", () => {
  it("extracts searchable text from generated policy HTML", async () => {
    const html = await readFile("tests/generated-documents/L123456800/L123456800-policy-document.html", "utf8");
    const text = extractTextFromHtml(html);

    expect(text).toContain("Policy Number: L123456800");
    expect(text).toContain("Premium: $45.00 monthly by bank draft");
    expect(text).toContain("Beneficiary: Ethan Rivera spouse 100%");
  });
});
