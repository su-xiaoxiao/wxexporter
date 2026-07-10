import pino from "pino";

// Structured logger so subprocess failures / timeouts / non-zero exits are
// observable and greppable (eng review A1: "出错报错 + 服务记完整日志").
// pino-pretty in dev for readability; JSON in prod for log shipping.
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development";

export const logger = pino(
  isDev
    ? {
        level: process.env.LOG_LEVEL ?? "info",
        transport: { target: "pino-pretty" },
      }
    : { level: process.env.LOG_LEVEL ?? "info" },
);
