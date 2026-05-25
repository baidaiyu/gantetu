import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";
const dataDir = join(root, "data");
const dbPath = join(dataDir, "db.json");

const emptyState = {
  people: [],
  requirements: [],
  versions: [],
  workItems: [],
  holidays: [],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dbPath, "utf8");
  } catch {
    await writeFile(dbPath, JSON.stringify(emptyState, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  try {
    return JSON.parse(await readFile(dbPath, "utf8"));
  } catch {
    return emptyState;
  }
}

async function writeDb(state) {
  await ensureDb();
  const next = {
    people: Array.isArray(state.people) ? state.people : [],
    requirements: Array.isArray(state.requirements) ? state.requirements : [],
    versions: Array.isArray(state.versions) ? state.versions : [],
    workItems: Array.isArray(state.workItems) ? state.workItems : [],
    holidays: Array.isArray(state.holidays) ? state.holidays : [],
  };
  await writeFile(dbPath, JSON.stringify(next, null, 2));
  return next;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        request.destroy();
        reject(new Error("Body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(root)) {
    sendNotFound(response);
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => sendNotFound(response));
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  stream.pipe(response);
}

await ensureDb();

createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/state") && request.method === "GET") {
      sendJson(response, 200, await readDb());
      return;
    }
    if (request.url?.startsWith("/api/state") && request.method === "PUT") {
      const body = await readBody(request);
      sendJson(response, 200, await writeDb(JSON.parse(body || "{}")));
      return;
    }
    serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
}).listen(port, host, () => {
  console.log(`Demand calendar server listening on http://${host}:${port}`);
  console.log(`Database file: ${dbPath}`);
});
