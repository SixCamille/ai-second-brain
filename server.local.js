import http from "node:http";
import { loadLocalEnv } from "./src/env.js";
import { sendStaticAsset } from "./src/asset-handler.js";
import { BrainStore } from "./src/brain-store.js";
import { renderIndexPage } from "./src/index-page.js";
import { createMcpHandler } from "./src/mcp-handler.js";
import { handleViewLogin, isViewAuthorized, sendViewLogin } from "./src/security.js";

loadLocalEnv();

const mcpHandler = createMcpHandler();
const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (await sendStaticAsset(request, response)) {
    return;
  }
  if (url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      name: "second-brain-mcp",
      transport: "streamable-http"
    });
    return;
  }
  if (url.pathname === "/" && request.method === "POST") {
    await handleViewLogin(request, response);
    return;
  }
  if (url.pathname === "/") {
    if (!isViewAuthorized(request)) {
      sendViewLogin(response);
      return;
    }
    const store = await BrainStore.create();
    sendHtml(response, 200, await renderIndexPage(store));
    return;
  }
  if (url.pathname === "/mcp" || url.pathname === "/api/mcp") {
    await mcpHandler(request, response);
    return;
  }
  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.error(`Second Brain MCP listening on http://localhost:${port}/mcp`);
});

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store"
  });
  response.end(html);
}
