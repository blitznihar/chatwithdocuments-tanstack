import {
  modelCapabilities,
  modelCatalogSchema,
  modelLabel,
  type ModelCatalog,
  type ModelOption
} from "@doc-ai/api-contracts";
import { envList, envString } from "@doc-ai/shared-config";
import { ServiceError } from "@doc-ai/shared-errors";

export type ModelCatalogConfig = {
  allowedAgentNames: string[];
  allowedOcrNames: string[];
  availableNames: string[];
  defaultAgentName: string;
  defaultOcrName: string;
};

export function loadModelCatalogConfig(): ModelCatalogConfig {
  return {
    allowedAgentNames: envList("MODEL_ALLOWED_AGENT_NAMES", [
      "ai/gpt-oss:latest",
      "ai/ministral3:14B",
      "ai/gemma4:latest",
      "ai/gemma4:31B"
    ]),
    allowedOcrNames: envList("MODEL_ALLOWED_OCR_NAMES", ["ai/qwen3-vl:latest"]),
    availableNames: envList("MODEL_AVAILABLE_NAMES", [
      "ai/gpt-oss:latest",
      "ai/ministral3:14B",
      "ai/qwen3-vl:latest",
      "ai/gemma4:latest",
      "ai/gemma4:31B",
      "ai/mxbai-embed-large:latest"
    ]),
    defaultAgentName: envString("MODEL_DEFAULT_AGENT_NAME", "ai/gpt-oss:latest"),
    defaultOcrName: envString("MODEL_DEFAULT_OCR_NAME", "ai/qwen3-vl:latest")
  };
}

export function buildModelCatalog(config: ModelCatalogConfig): ModelCatalog {
  const available = new Set(config.availableNames);
  const ocrModels = config.allowedOcrNames.filter((name) => available.has(name)).map((name) => toModelOption(name, config.defaultOcrName));
  const agentModels = config.allowedAgentNames
    .filter((name) => available.has(name))
    .map((name) => toModelOption(name, config.defaultAgentName));

  const catalog = {
    defaults: {
      ocrModelName: config.defaultOcrName,
      agentModelName: config.defaultAgentName
    },
    dropdowns: {
      ocr: {
        label: "OCR and visual extraction model",
        models: ocrModels
      },
      agent: {
        label: "Agent and answer model",
        models: agentModels
      }
    },
    availableModels: config.availableNames.map((name) => toModelOption(name))
  };

  const parsed = modelCatalogSchema.parse(catalog);
  validateCatalog(parsed);
  return parsed;
}

export function assertModelSelectionAllowed(catalog: ModelCatalog, selectedOcrModelName: string, selectedAgentModelName: string): void {
  const ocrAllowed = catalog.dropdowns.ocr.models.some((model) => model.name === selectedOcrModelName);
  const agentAllowed = catalog.dropdowns.agent.models.some((model) => model.name === selectedAgentModelName);
  if (!ocrAllowed) {
    throw new ServiceError("MODEL_NOT_ALLOWED", "Selected OCR model is not enabled for OCR extraction", 400, {
      selectedOcrModelName
    });
  }
  if (!agentAllowed) {
    throw new ServiceError("MODEL_NOT_ALLOWED", "Selected agent model is not enabled for agent functionality", 400, {
      selectedAgentModelName
    });
  }
}

function validateCatalog(catalog: ModelCatalog): void {
  const ocrNames = new Set(catalog.dropdowns.ocr.models.map((model) => model.name));
  const agentNames = new Set(catalog.dropdowns.agent.models.map((model) => model.name));
  if (!ocrNames.has(catalog.defaults.ocrModelName)) {
    throw new ServiceError("MODEL_CATALOG_INVALID", "Default OCR model is not enabled", 500);
  }
  if (!agentNames.has(catalog.defaults.agentModelName)) {
    throw new ServiceError("MODEL_CATALOG_INVALID", "Default agent model is not enabled", 500);
  }
  for (const model of catalog.dropdowns.ocr.models) {
    if (!model.capabilities.includes("ocr")) {
      throw new ServiceError("MODEL_CATALOG_INVALID", `${model.name} is not an OCR-capable model`, 500);
    }
  }
  for (const model of catalog.dropdowns.agent.models) {
    if (!model.capabilities.includes("chat")) {
      throw new ServiceError("MODEL_CATALOG_INVALID", `${model.name} is not an agent-capable model`, 500);
    }
  }
}

function toModelOption(name: string, defaultName?: string): ModelOption {
  return {
    name,
    label: modelLabel(name),
    capabilities: modelCapabilities(name),
    default: defaultName ? name === defaultName : false
  };
}
