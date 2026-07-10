import { Hono } from "hono";
import { getStatus } from "../status.js";

export const statusApp = new Hono();

statusApp.get("/", (c) => c.json(getStatus()));
