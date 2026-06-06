export function envString(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

export function envOptionalString(key: string): string | undefined {
  const value = process.env[key];
  return value === "" ? undefined : value;
}

export function envNumber(key: string, fallback?: number): number {
  const value = process.env[key];
  if ((value === undefined || value === "") && fallback !== undefined) {
    return fallback;
  }
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${key}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export function envList(key: string, fallback?: string[]): string[] {
  const value = process.env[key];
  if (!value && fallback) return fallback;
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function localServiceUrl(portKey: string, fallbackPort: number): string {
  return `http://localhost:${envNumber(portKey, fallbackPort)}`;
}
