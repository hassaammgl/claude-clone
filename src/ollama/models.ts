import { loadSettings } from "../config/settings";
import { isRecord } from "../agent/providers/types";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const BYTES_PER_GIB = 1024 * 1024 * 1024;

export interface OllamaModelInfo {
  name: string;
  size: number;
}

export function getOllamaBaseUrl(): string {
  const settings = loadSettings();
  return (
    process.env.OLLAMA_BASE_URL ||
    settings.ollamaBaseUrl ||
    DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/+$/, "");
}

function isOllamaModelInfo(value: unknown): value is OllamaModelInfo {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.size === "number"
  );
}

export async function listOllamaModels(
  baseUrl = getOllamaBaseUrl(),
): Promise<OllamaModelInfo[]> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch models from Ollama at ${baseUrl}`);
  }
  const data: unknown = await res.json();
  if (!isRecord(data) || !Array.isArray(data.models)) {
    return [];
  }
  return data.models.filter(isOllamaModelInfo);
}

export function formatModelSize(size: number): string {
  return `${(size / BYTES_PER_GIB).toFixed(1)} GB`;
}
