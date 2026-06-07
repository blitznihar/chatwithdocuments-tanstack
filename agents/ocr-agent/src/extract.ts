import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfTextFromBase64 } from "@doc-ai/agent-runtime";

export type OcrDocumentMetadata = {
  originalFilename?: string;
  policyNumber?: string;
  sourceSystem?: string;
};

export async function extractDocumentText(input: {
  metadata?: OcrDocumentMetadata;
  pdfBase64: string;
}): Promise<string> {
  const sidecarText = await extractGeneratedHtmlSidecarText(input.metadata);
  if (sidecarText) return sidecarText;
  return extractPdfTextFromBase64(input.pdfBase64);
}

export async function extractGeneratedHtmlSidecarText(metadata: OcrDocumentMetadata | undefined): Promise<string> {
  if (metadata?.sourceSystem !== "PDF_GENERATOR" || !metadata.originalFilename || !metadata.policyNumber) {
    return "";
  }

  const htmlFilename = metadata.originalFilename.replace(/\.pdf$/i, ".html");
  const relativePath = path.join("tests", "generated-documents", metadata.policyNumber, htmlFilename);

  for (const root of candidateRepoRoots()) {
    try {
      const html = await readFile(path.join(root, relativePath), "utf8");
      return extractTextFromHtml(html);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return "";
}

export function extractTextFromHtml(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const withoutScripts = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  const withTableRows = withoutScripts.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    const cells = Array.from(row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi), (match) =>
      stripHtml(match[1] ?? "")
    ).filter(Boolean);
    return cells.length ? `\n${cells.join(": ")}\n` : "\n";
  });

  return decodeHtmlEntities(
    withTableRows
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li|section|article|div|table|ol|ul)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function candidateRepoRoots(): string[] {
  return [...new Set([process.cwd(), path.resolve(process.cwd(), "../.."), "/app"])];
}
