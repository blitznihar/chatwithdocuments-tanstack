import { createLogger } from "@doc-ai/shared-logger";
import { buildDmsApi } from "./app.js";
import { loadDmsConfig } from "./config.js";
import { createDocumentStore } from "./storage.js";

const logger = createLogger("dms-api");
const config = loadDmsConfig();
const store = createDocumentStore(config);
const app = await buildDmsApi(config, store);

await app.listen({ host: "0.0.0.0", port: config.port });
logger.info({ port: config.port, storageMode: config.storageMode }, "DMS API listening");
