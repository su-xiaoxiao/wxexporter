import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".wxexport");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface ClientConfig {
  authKey?: string;
  /** 服务 endpoint。默认本地;公司/个人电脑改远程服务地址。 */
  baseUrl: string;
}

export function loadConfig(): ClientConfig {
  const fallback: ClientConfig = {
    baseUrl: process.env.WXEXPORT_BASE_URL ?? "http://localhost:3000",
  };
  try {
    if (!existsSync(CONFIG_FILE)) return fallback;
    const raw = readFileSync(CONFIG_FILE, "utf8");
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function saveConfig(cfg: ClientConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}
