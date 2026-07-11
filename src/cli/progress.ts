import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PROGRESS_DIR = path.join(os.homedir(), ".wxexport");

export interface Progress {
  fakeid: string;
  total: number;
  /** 已成功抓取的文章 URL(断点续传跳过这些)。 */
  fetched: string[];
}

export function progressPath(fakeid: string): string {
  return path.join(PROGRESS_DIR, `progress-${fakeid}.json`);
}

export function loadProgress(fakeid: string): Progress | null {
  const p = progressPath(fakeid);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Progress;
  } catch {
    return null;
  }
}

export function saveProgress(p: Progress): void {
  mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(progressPath(p.fakeid), JSON.stringify(p, null, 2), "utf8");
}
