import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { createServer } from "http";

const QUEUE_DIR = "/tmp/opencode/livefix";
const CMD_FILE = join(QUEUE_DIR, "command.json");
const RESP_FILE = join(QUEUE_DIR, "response.json");
const MAX_REQUEST_BODY_BYTES = 65_536;

let server: ReturnType<typeof createServer> | null = null;

function ensureDir() {
    if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true });
}

let queue: Array<{ body: string; res: import("http").ServerResponse; }> = [];
let inFlight = false;
let activeResponse: import("http").ServerResponse | null = null;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;

function processQueue() {
    if (inFlight || queue.length === 0) return;
    inFlight = true;
    const { body, res } = queue.shift()!;
    activeResponse = res;

    try {
        writeFileSync(CMD_FILE, body);
        const startTime = Date.now();
        const checkResponse = () => {
            if (activeResponse !== res) return;

            if (existsSync(RESP_FILE)) {
                const resp = readFileSync(RESP_FILE, "utf-8");
                try { unlinkSync(RESP_FILE); } catch { /* */ }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(resp);
                activeResponse = null;
                activeTimeout = null;
                inFlight = false;
                processQueue();
            } else if (Date.now() - startTime > 10000) {
                res.writeHead(504, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Timeout waiting for renderer response" }));
                activeResponse = null;
                activeTimeout = null;
                inFlight = false;
                processQueue();
            } else {
                activeTimeout = setTimeout(checkResponse, 50);
            }
        };
        activeTimeout = setTimeout(checkResponse, 50);
    } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
        activeResponse = null;
        activeTimeout = null;
        inFlight = false;
        processQueue();
    }
}

export function startLiveFixServer(_: unknown): Promise<void> {
    if (server) return Promise.resolve();

    ensureDir();

    return new Promise((resolve, reject) => {
        server = createServer((req, res) => {
            if (req.method === "POST") {
                let body = "";
                let bodyLength = 0;
                let rejected = false;
                req.setEncoding("utf8");
                req.on("data", chunk => {
                    if (rejected) return;

                    bodyLength += Buffer.byteLength(chunk);
                    if (bodyLength > MAX_REQUEST_BODY_BYTES) {
                        rejected = true;
                        res.writeHead(413);
                        res.end();
                        return;
                    }

                    body += chunk;
                });
                req.on("end", () => {
                    if (rejected) return;
                    queue.push({ body, res });
                    processQueue();
                });
            } else {
                res.writeHead(405);
                res.end();
            }
        });

        server.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                // Port in use means server from a prior renderer is alive — reuse it
                server = null;
                resolve();
            } else {
                server = null;
                reject(err);
            }
        });

        server.listen(18963, "127.0.0.1", () => resolve());
    });
}

export function stopLiveFixServerCleanup(_: unknown) {
    if (activeTimeout) clearTimeout(activeTimeout);
    activeTimeout = null;
    if (activeResponse && !activeResponse.writableEnded) {
        activeResponse.writeHead(503, { "Content-Type": "application/json" });
        activeResponse.end(JSON.stringify({ error: "LiveFix server is shutting down" }));
    }
    activeResponse = null;
    for (const { res } of queue) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "LiveFix server is shutting down" }));
    }
    queue.length = 0;
    inFlight = false;
}

export function stopLiveFixServer(_: unknown) {
    stopLiveFixServerCleanup(_);
    if (server) { server.close(); server = null; }
}

export function getCommand(_: unknown): string | null {
    if (!existsSync(CMD_FILE)) return null;
    try {
        const cmd = readFileSync(CMD_FILE, "utf-8");
        unlinkSync(CMD_FILE);
        return cmd;
    } catch {
        return null;
    }
}

export function writeResponse(_: unknown, data: string) {
    writeFileSync(RESP_FILE, data);
}
