import { envList, envNumber, envString } from "@doc-ai/shared-config";
import { createLogger } from "@doc-ai/shared-logger";
import { buildWrapperApi } from "./app.js";
import { loadModelCatalogConfig } from "./modelCatalog.js";

const logger = createLogger("wrapper-api");
const port = envNumber("WRAPPER_API_PORT", 3201);
const app = await buildWrapperApi({
  allowedOrigins: envList("ALLOWED_ORIGINS", ["http://localhost:3000", "http://localhost:3102"]),
  masterAgentUrl: envString("MASTER_AGENT_URL", "http://localhost:3301"),
  modelCatalog: loadModelCatalogConfig()
});

await app.listen({ host: "0.0.0.0", port });
logger.info({ port }, "Wrapper API listening");
