import { envList, envNumber, envString } from "@doc-ai/shared-config";

export type DmsConfig = {
  allowedMimeTypes: string[];
  allowedOrigins: string[];
  gridFsBucket: string;
  localDataDir: string;
  maxPdfBytes: number;
  mongoDatabase: string;
  mongoUrl: string;
  mysql: {
    database: string;
    host: string;
    password: string;
    port: number;
    user: string;
  };
  port: number;
  storageMode: "local" | "database";
};

export function loadDmsConfig(): DmsConfig {
  return {
    allowedMimeTypes: envList("UPLOAD_ALLOWED_MIME_TYPES", ["application/pdf"]),
    allowedOrigins: envList("ALLOWED_ORIGINS", ["http://localhost:3000", "http://localhost:3102"]),
    gridFsBucket: envString("MONGODB_GRIDFS_BUCKET", "dms_documents"),
    localDataDir: envString("DMS_LOCAL_DATA_DIR", ".local-data/dms-api"),
    maxPdfBytes: envNumber("MAX_PDF_BYTES", 10 * 1024 * 1024),
    mongoDatabase: envString("MONGODB_DATABASE", "document_ai"),
    mongoUrl: envString("MONGODB_URL", "mongodb://localhost:27017"),
    mysql: {
      database: envString("MYSQL_DATABASE", "document_ai"),
      host: envString("MYSQL_HOST", "localhost"),
      password: envString("MYSQL_PASSWORD", "document_ai"),
      port: envNumber("MYSQL_PORT", 3306),
      user: envString("MYSQL_USER", "document_ai")
    },
    port: envNumber("DMS_API_PORT", 3101),
    storageMode: envString("DMS_STORAGE_MODE", "local") === "database" ? "database" : "local"
  };
}
