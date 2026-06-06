import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { documentQuerySchema } from "@doc-ai/api-contracts";
import { errorStatus, ServiceError, toErrorEnvelope } from "@doc-ai/shared-errors";
import type { DmsConfig } from "./config.js";
import type { DocumentStore, UploadDocumentInput } from "./storage.js";

export async function buildDmsApi(config: DmsConfig, store: DocumentStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: config.allowedOrigins
  });
  await app.register(helmet, {
    contentSecurityPolicy: false
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxPdfBytes,
      files: 1
    }
  });

  app.get("/health/live", async () => ({ status: "live", service: "dms-api" }));
  app.get("/health/ready", async () => ({ status: "ready", service: "dms-api", dependencies: await store.ready() }));
  app.get("/metrics", async () => {
    const dependencyState = await store.ready();
    return `service_info{name="dms-api"} 1\ndms_documents_total ${dependencyState.documents ?? 0}\n`;
  });

  app.post("/api/v1/documents", async (request, reply) => {
    const upload = await parseMultipartUpload(request, config);
    const metadata = await store.upload(upload);
    reply.status(201);
    return {
      handleId: metadata.handleId,
      metadata
    };
  });

  app.get("/api/v1/documents", async (request) => {
    const query = documentQuerySchema.parse(request.query);
    const documents = await store.query(query);
    return {
      documents,
      count: documents.length
    };
  });

  app.get("/api/v1/documents/:handleId", async (request) => {
    const { handleId } = request.params as { handleId: string };
    return store.get(handleId);
  });

  app.get("/api/v1/documents/:handleId/file", async (request, reply) => {
    const { handleId } = request.params as { handleId: string };
    const metadata = await store.get(handleId);
    const pdf = await store.getPdf(handleId);
    reply
      .header("content-type", metadata.mimeType)
      .header("content-disposition", `inline; filename="${metadata.originalFilename}"`)
      .send(pdf);
  });

  app.delete("/api/v1/documents/:handleId", async (request) => {
    const { handleId } = request.params as { handleId: string };
    return store.softDelete(handleId);
  });

  app.setErrorHandler((error, request, reply) => {
    reply.status(errorStatus(error)).send(toErrorEnvelope(error, request.id));
  });

  app.addHook("onClose", async () => {
    await store.close();
  });

  return app;
}

async function parseMultipartUpload(request: Parameters<FastifyInstance["route"]>[0] extends never ? never : any, config: DmsConfig): Promise<UploadDocumentInput> {
  const fields = new Map<string, string>();
  let file: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
  } | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (file) throw new ServiceError("UPLOAD_TOO_MANY_FILES", "Only one PDF can be uploaded", 400);
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of part.file) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > config.maxPdfBytes) {
          throw new ServiceError("UPLOAD_TOO_LARGE", "PDF exceeds configured upload limit", 413);
        }
        chunks.push(buffer);
      }
      file = {
        buffer: Buffer.concat(chunks),
        filename: part.filename,
        mimeType: part.mimetype
      };
    } else {
      fields.set(part.fieldname, String(part.value ?? ""));
    }
  }

  if (!file) throw new ServiceError("UPLOAD_FILE_REQUIRED", "A PDF file is required", 400);
  if (!config.allowedMimeTypes.includes(file.mimeType)) {
    throw new ServiceError("UPLOAD_MIME_TYPE_REJECTED", "Only PDF uploads are supported", 400, {
      mimeType: file.mimeType
    });
  }
  if (!file.buffer.subarray(0, 5).toString("utf8").startsWith("%PDF-")) {
    throw new ServiceError("UPLOAD_INVALID_PDF", "Uploaded file does not look like a PDF", 400);
  }

  const policyNumber = fields.get("policyNumber")?.trim();
  const documentType = fields.get("documentType")?.trim();
  if (!policyNumber || !documentType) {
    throw new ServiceError("UPLOAD_METADATA_REQUIRED", "policyNumber and documentType are required", 400);
  }

  return {
    policyNumber,
    documentType,
    customerId: fields.get("customerId")?.trim() || undefined,
    beneficiaryId: fields.get("beneficiaryId")?.trim() || undefined,
    sourceSystem: fields.get("sourceSystem")?.trim() || "LOCAL_DMS_UI",
    originalFilename: file.filename || "document.pdf",
    mimeType: file.mimeType,
    pdf: file.buffer
  };
}
