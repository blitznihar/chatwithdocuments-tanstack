import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDmsApi } from "../src/app.js";
import type { DmsConfig } from "../src/config.js";
import { createLocalDocumentStore, type DocumentStore } from "../src/storage.js";

let dataDir: string;
let store: DocumentStore;

const config: DmsConfig = {
  allowedMimeTypes: ["application/pdf"],
  allowedOrigins: ["http://localhost:3102"],
  gridFsBucket: "dms_documents",
  localDataDir: "",
  maxPdfBytes: 1024 * 1024,
  mongoDatabase: "test",
  mongoUrl: "mongodb://localhost:27017",
  mysql: {
    database: "test",
    host: "localhost",
    password: "test",
    port: 3306,
    user: "test"
  },
  port: 0,
  storageMode: "local"
};

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "dms-api-"));
  store = createLocalDocumentStore(dataDir);
});

afterEach(async () => {
  await store.close();
  await rm(dataDir, { recursive: true, force: true });
});

describe("DMS API", () => {
  it("uploads, queries, fetches, and soft deletes a PDF", async () => {
    const app = await buildDmsApi({ ...config, localDataDir: dataDir }, store);
    const pdf = await readFile(path.resolve("tests/fixtures/sample-policy.pdf"));
    const multipart = buildMultipart({
      fields: {
        policyNumber: "POL-1001",
        documentType: "POLICY",
        customerId: "CUST-001",
        beneficiaryId: "BEN-001",
        sourceSystem: "LOCAL_DMS_UI"
      },
      file: pdf
    });

    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: {
        "content-type": `multipart/form-data; boundary=${multipart.boundary}`
      },
      payload: multipart.payload
    });

    expect(upload.statusCode).toBe(201);
    const uploaded = upload.json();
    expect(uploaded.handleId).toMatch(/^HDL-/);
    expect(uploaded.metadata.policyNumber).toBe("POL-1001");

    const query = await app.inject("/api/v1/documents?policyNumber=POL-1001");
    expect(query.statusCode).toBe(200);
    expect(query.json().count).toBe(1);

    const fetched = await app.inject(`/api/v1/documents/${uploaded.handleId}/file`);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.body.startsWith("%PDF-")).toBe(true);

    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/documents/${uploaded.handleId}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().status).toBe("DELETED");

    const missing = await app.inject(`/api/v1/documents/${uploaded.handleId}`);
    expect(missing.statusCode).toBe(404);

    await app.close();
  });
});

function buildMultipart(input: {
  fields: Record<string, string>;
  file: Buffer;
}): { boundary: string; payload: Buffer } {
  const boundary = `----doc-ai-${Date.now()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample-policy.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    )
  );
  parts.push(input.file);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    boundary,
    payload: Buffer.concat(parts)
  };
}
