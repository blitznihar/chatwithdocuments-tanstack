import { createReadStream } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { GridFSBucket, MongoClient, ObjectId } from "mongodb";
import mysql from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import { documentQuerySchema, type DocumentMetadata, type DocumentQuery } from "@doc-ai/api-contracts";
import { ServiceError } from "@doc-ai/shared-errors";
import type { DmsConfig } from "./config.js";

export type UploadDocumentInput = {
  policyNumber: string;
  documentType: string;
  customerId?: string;
  beneficiaryId?: string;
  sourceSystem?: string;
  originalFilename: string;
  mimeType: string;
  pdf: Buffer;
};

export type DocumentStore = {
  close(): Promise<void>;
  get(handleId: string): Promise<DocumentMetadata>;
  getPdf(handleId: string): Promise<Buffer>;
  query(query: DocumentQuery): Promise<DocumentMetadata[]>;
  ready(): Promise<Record<string, unknown>>;
  softDelete(handleId: string): Promise<DocumentMetadata>;
  upload(input: UploadDocumentInput): Promise<DocumentMetadata>;
};

type LocalRecord = DocumentMetadata & {
  filePath: string;
};

const localIndexFile = "documents.json";

export class LocalDocumentStore implements DocumentStore {
  private initialized = false;
  private records = new Map<string, LocalRecord>();

  constructor(private readonly dataDir: string) {}

  async close(): Promise<void> {}

  async ready(): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    return {
      mode: "local",
      documents: this.records.size,
      dataDir: this.dataDir
    };
  }

  async upload(input: UploadDocumentInput): Promise<DocumentMetadata> {
    await this.ensureLoaded();
    const now = new Date().toISOString();
    const handleId = `HDL-${uuidv4()}`;
    const pdfDir = path.join(this.dataDir, "pdfs");
    await mkdir(pdfDir, { recursive: true });
    const filePath = path.join(pdfDir, `${handleId}.pdf`);
    await writeFile(filePath, input.pdf);

    const record: LocalRecord = {
      handleId,
      policyNumber: input.policyNumber,
      documentType: input.documentType,
      customerId: input.customerId,
      beneficiaryId: input.beneficiaryId,
      sourceSystem: input.sourceSystem ?? "LOCAL_DMS_UI",
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.pdf.byteLength,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      filePath
    };
    this.records.set(handleId, record);
    await this.flush();
    return toMetadata(record);
  }

  async query(rawQuery: DocumentQuery): Promise<DocumentMetadata[]> {
    await this.ensureLoaded();
    const query = documentQuerySchema.parse(rawQuery);
    return Array.from(this.records.values())
      .filter((record) => query.includeDeleted || record.status !== "DELETED")
      .filter((record) => !query.policyNumber || record.policyNumber === query.policyNumber)
      .filter((record) => !query.documentType || record.documentType === query.documentType)
      .filter((record) => !query.customerId || record.customerId === query.customerId)
      .filter((record) => !query.beneficiaryId || record.beneficiaryId === query.beneficiaryId)
      .filter((record) => !query.updatedAfter || record.updatedAt > query.updatedAfter)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, query.limit ?? 50)
      .map(toMetadata);
  }

  async get(handleId: string): Promise<DocumentMetadata> {
    await this.ensureLoaded();
    const record = this.records.get(handleId);
    if (!record || record.status === "DELETED") {
      throw new ServiceError("DOCUMENT_NOT_FOUND", `No active document found for ${handleId}`, 404);
    }
    return toMetadata(record);
  }

  async getPdf(handleId: string): Promise<Buffer> {
    await this.ensureLoaded();
    const record = this.records.get(handleId);
    if (!record || record.status === "DELETED") {
      throw new ServiceError("DOCUMENT_NOT_FOUND", `No active PDF found for ${handleId}`, 404);
    }
    return readFile(record.filePath);
  }

  async softDelete(handleId: string): Promise<DocumentMetadata> {
    await this.ensureLoaded();
    const record = this.records.get(handleId);
    if (!record || record.status === "DELETED") {
      throw new ServiceError("DOCUMENT_NOT_FOUND", `No active document found for ${handleId}`, 404);
    }
    const now = new Date().toISOString();
    const next: LocalRecord = { ...record, status: "DELETED", updatedAt: now, deletedAt: now };
    this.records.set(handleId, next);
    await this.flush();
    return toMetadata(next);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.dataDir, { recursive: true });
    try {
      const contents = await readFile(path.join(this.dataDir, localIndexFile), "utf8");
      const parsed = JSON.parse(contents) as LocalRecord[];
      this.records = new Map(parsed.map((record) => [record.handleId, record]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.records = new Map();
    }
    this.initialized = true;
  }

  private async flush(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      path.join(this.dataDir, localIndexFile),
      JSON.stringify(Array.from(this.records.values()), null, 2)
    );
  }
}

export class DatabaseDocumentStore implements DocumentStore {
  private bucket?: GridFSBucket;
  private mongo?: MongoClient;
  private pool?: mysql.Pool;

  constructor(private readonly config: DmsConfig) {}

  async close(): Promise<void> {
    await this.pool?.end();
    await this.mongo?.close();
  }

  async ready(): Promise<Record<string, unknown>> {
    await this.ensureConnected();
    await this.pool?.query("SELECT 1");
    await this.mongo?.db(this.config.mongoDatabase).command({ ping: 1 });
    return {
      mode: "database",
      mysql: this.config.mysql.database,
      mongodb: this.config.mongoDatabase,
      gridFsBucket: this.config.gridFsBucket
    };
  }

  async upload(input: UploadDocumentInput): Promise<DocumentMetadata> {
    await this.ensureConnected();
    const handleId = `HDL-${uuidv4()}`;
    const now = new Date();
    const gridFsId = await this.writeGridFs(handleId, input);
    try {
      await this.pool!.execute(
        `INSERT INTO documents
          (handle_id, policy_number, document_type, customer_id, beneficiary_id, source_system,
           original_filename, mime_type, size_bytes, gridfs_file_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        [
          handleId,
          input.policyNumber,
          input.documentType,
          input.customerId ?? null,
          input.beneficiaryId ?? null,
          input.sourceSystem ?? "LOCAL_DMS_UI",
          input.originalFilename,
          input.mimeType,
          input.pdf.byteLength,
          gridFsId.toHexString(),
          now,
          now
        ]
      );
    } catch (error) {
      await this.bucket!.delete(gridFsId).catch(() => undefined);
      throw error;
    }
    return this.get(handleId);
  }

  async query(rawQuery: DocumentQuery): Promise<DocumentMetadata[]> {
    await this.ensureConnected();
    const query = documentQuerySchema.parse(rawQuery);
    const where = query.includeDeleted ? ["1 = 1"] : ["deleted_at IS NULL", "status = 'ACTIVE'"];
    const params: Array<string | number | Date> = [];
    const add = (column: string, value?: string) => {
      if (!value) return;
      where.push(`${column} = ?`);
      params.push(value);
    };
    add("policy_number", query.policyNumber);
    add("document_type", query.documentType);
    add("customer_id", query.customerId);
    add("beneficiary_id", query.beneficiaryId);
    if (query.updatedAfter) {
      where.push("updated_at > ?");
      params.push(new Date(query.updatedAfter));
    }
    params.push(query.limit ?? 50);
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM documents WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`,
      params
    );
    return rows.map(rowToMetadata);
  }

  async get(handleId: string): Promise<DocumentMetadata> {
    await this.ensureConnected();
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      "SELECT * FROM documents WHERE handle_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'",
      [handleId]
    );
    const row = rows[0];
    if (!row) throw new ServiceError("DOCUMENT_NOT_FOUND", `No active document found for ${handleId}`, 404);
    return rowToMetadata(row);
  }

  async getPdf(handleId: string): Promise<Buffer> {
    await this.ensureConnected();
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      "SELECT gridfs_file_id FROM documents WHERE handle_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'",
      [handleId]
    );
    const row = rows[0];
    if (!row) throw new ServiceError("DOCUMENT_NOT_FOUND", `No active PDF found for ${handleId}`, 404);
    const chunks: Buffer[] = [];
    await finished(
      this.bucket!.openDownloadStream(new ObjectId(String(row.gridfs_file_id))).on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      })
    );
    return Buffer.concat(chunks);
  }

  async softDelete(handleId: string): Promise<DocumentMetadata> {
    await this.ensureConnected();
    const now = new Date();
    const [result] = await this.pool!.execute<mysql.ResultSetHeader>(
      "UPDATE documents SET status = 'DELETED', deleted_at = ?, updated_at = ? WHERE handle_id = ? AND deleted_at IS NULL",
      [now, now, handleId]
    );
    if (result.affectedRows === 0) {
      throw new ServiceError("DOCUMENT_NOT_FOUND", `No active document found for ${handleId}`, 404);
    }
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>("SELECT * FROM documents WHERE handle_id = ?", [
      handleId
    ]);
    return rowToMetadata(rows[0]!);
  }

  private async ensureConnected(): Promise<void> {
    if (this.pool && this.mongo && this.bucket) return;
    this.pool = mysql.createPool({
      database: this.config.mysql.database,
      host: this.config.mysql.host,
      password: this.config.mysql.password,
      port: this.config.mysql.port,
      user: this.config.mysql.user,
      waitForConnections: true
    });
    this.mongo = new MongoClient(this.config.mongoUrl);
    await this.mongo.connect();
    this.bucket = new GridFSBucket(this.mongo.db(this.config.mongoDatabase), {
      bucketName: this.config.gridFsBucket
    });
    await this.migrate();
  }

  private async migrate(): Promise<void> {
    await this.pool!.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        handle_id VARCHAR(128) NOT NULL UNIQUE,
        policy_number VARCHAR(128) NOT NULL,
        document_type VARCHAR(128) NOT NULL,
        customer_id VARCHAR(128),
        beneficiary_id VARCHAR(128),
        source_system VARCHAR(128) NOT NULL DEFAULT 'LOCAL_DMS_UI',
        original_filename VARCHAR(512) NOT NULL,
        mime_type VARCHAR(128) NOT NULL DEFAULT 'application/pdf',
        size_bytes BIGINT NOT NULL,
        gridfs_file_id VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3),
        INDEX idx_documents_policy (policy_number),
        INDEX idx_documents_customer (customer_id),
        INDEX idx_documents_beneficiary (beneficiary_id),
        INDEX idx_documents_type (document_type),
        INDEX idx_documents_updated (updated_at)
      )
    `);
    await this.pool!.execute(`
      CREATE TABLE IF NOT EXISTS document_audit_events (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        handle_id VARCHAR(128) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        event_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        details JSON NULL
      )
    `);
    await this.pool!.execute(`
      CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        checkpoint_name VARCHAR(128) NOT NULL UNIQUE,
        last_seen_updated_at DATETIME(3) NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async writeGridFs(handleId: string, input: UploadDocumentInput): Promise<ObjectId> {
    const upload = this.bucket!.openUploadStream(input.originalFilename, {
      metadata: {
        handleId,
        policyNumber: input.policyNumber,
        documentType: input.documentType,
        sourceSystem: input.sourceSystem ?? "LOCAL_DMS_UI"
      }
    });
    Readable.from(input.pdf).pipe(upload);
    await finished(upload);
    return upload.id as ObjectId;
  }
}

export function createDocumentStore(config: DmsConfig): DocumentStore {
  return config.storageMode === "database"
    ? new DatabaseDocumentStore(config)
    : new LocalDocumentStore(config.localDataDir);
}

export function createLocalDocumentStore(dataDir: string): DocumentStore {
  return new LocalDocumentStore(dataDir);
}

export async function seedLocalFixture(store: DocumentStore, fixturePath: string): Promise<DocumentMetadata> {
  const pdf = await readFile(fixturePath);
  return store.upload({
    policyNumber: "POL-1001",
    documentType: "POLICY",
    customerId: "CUST-001",
    beneficiaryId: "BEN-001",
    sourceSystem: "LOCAL_DMS_UI",
    originalFilename: "sample-policy.pdf",
    mimeType: "application/pdf",
    pdf
  });
}

export async function removeLocalDataFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => undefined);
}

function toMetadata(record: LocalRecord): DocumentMetadata {
  const { filePath: _filePath, ...metadata } = record;
  return metadata;
}

function rowToMetadata(row: mysql.RowDataPacket): DocumentMetadata {
  return {
    handleId: String(row.handle_id),
    policyNumber: String(row.policy_number),
    documentType: String(row.document_type),
    customerId: row.customer_id === null ? undefined : String(row.customer_id),
    beneficiaryId: row.beneficiary_id === null ? undefined : String(row.beneficiary_id),
    sourceSystem: String(row.source_system),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    status: row.status === "DELETED" ? "DELETED" : "ACTIVE",
    createdAt: new Date(row.created_at as Date).toISOString(),
    updatedAt: new Date(row.updated_at as Date).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as Date).toISOString() : null
  };
}

export function streamPdfFromLocal(filePath: string): Readable {
  return createReadStream(filePath);
}
