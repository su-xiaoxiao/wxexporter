// Operational state for the /status运维 page. M1 is in-memory and non-persistent.
//
// IMPORTANT boundary: this is operational state only — uptime, recent fetch
// requests, worker mode. It is NOT a catalog of fetched articles. Per the
// "no business state" principle, "which articles have been fetched" lives in
// the编排 agent, not this service.

const startedAt = Date.now();

interface RequestRecord {
  url: string;
  status: "ok" | "error";
  ts: number;
}

const MAX_RECENT = 50;
const recent: RequestRecord[] = [];

export function recordRequest(entry: RequestRecord): void {
  recent.push(entry);
  if (recent.length > MAX_RECENT) recent.shift();
}

export interface StatusResponse {
  uptime_s: number;
  recentRequests: RequestRecord[];
  workerStatus: { engine: string; mode: string };
}

export function getStatus(): StatusResponse {
  return {
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    recentRequests: recent.slice(-20),
    workerStatus: {
      engine: "scrapling",
      mode: "spawn-on-demand", // M2 upgrades to a persistent worker pool (eng review P1)
    },
  };
}
