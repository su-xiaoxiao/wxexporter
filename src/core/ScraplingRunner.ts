import { execa, type ExecaError } from "execa";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// fetcher/scrapling_fetch.py lives at project root, next to src/.
const FETCHER_SCRIPT = path.resolve(__dirname, "../../fetcher/scrapling_fetch.py");
// uv run needs cwd at project root to find pyproject.toml (.venv lives there).
const PROJECT_ROOT = path.resolve(__dirname, "../..");

export interface ScraplingResult {
  title: string;
  cover_url: string;
  markdown: string;
}

/**
 * Subprocess-level error. Carries stderr + exitCode so the operator can diagnose
 * (scrapling missing, Python crashed, anti-crawl block, timeout, etc.).
 */
export class ScraplingRunnerError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
    public readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "ScraplingRunnerError";
  }
}

type ExecaResult = Awaited<ReturnType<typeof execa>>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Spawns `uv run python fetcher/scrapling_fetch.py <url> --json` and parses the
 * JSON result. All timeout / non-zero-exit / stderr / spawn-failure handling
 * lives here so it's in one place (eng review CQ3). Callers get either a parsed
 * ScraplingResult or a ScraplingRunnerError — never a silent failure.
 */
export async function runScrapling(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<ScraplingResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  let result: ExecaResult;
  try {
    result = await execa("uv", ["run", "python", FETCHER_SCRIPT, url, "--json"], {
      cwd: PROJECT_ROOT,
      timeout: timeoutMs,
      reject: false, // we handle non-zero / timeout below, not execa
    });
  } catch (err) {
    // Spawn-level failure (uv not installed, ENOENT). reject:false doesn't cover these.
    const e = err as ExecaError;
    throw new ScraplingRunnerError(
      `failed to spawn scrapling subprocess: ${e.message ?? String(err)}`,
      url,
      asString(e.stderr),
      null,
      false,
    );
  }

  const stderr = asString(result.stderr).trim();

  if (result.timedOut) {
    throw new ScraplingRunnerError(
      `scrapling_fetch.py timed out after ${timeoutMs}ms`,
      url,
      stderr,
      null,
      true,
    );
  }
  if (result.exitCode !== 0) {
    // scrapling_fetch.py exits 2 on its own exceptions (HTTP 404, anti-crawl block, etc.)
    throw new ScraplingRunnerError(
      `scrapling_fetch.py exited ${result.exitCode}`,
      url,
      stderr,
      result.exitCode ?? null,
      false,
    );
  }

  const stdout = asString(result.stdout).trim();
  if (!stdout) {
    throw new ScraplingRunnerError(
      "scrapling_fetch.py returned empty stdout",
      url,
      stderr,
      result.exitCode ?? null,
      false,
    );
  }

  try {
    return JSON.parse(stdout) as ScraplingResult;
  } catch (err) {
    throw new ScraplingRunnerError(
      `scrapling_fetch.py returned non-JSON stdout: ${(err as Error).message}`,
      url,
      stderr,
      result.exitCode ?? null,
      false,
    );
  }
}
