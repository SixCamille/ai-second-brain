import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_ROOT = fileURLToPath(new URL("./view/assets/", import.meta.url));
const STATIC_ASSETS = {
  "/assets/styles.css": {
    file: "styles.css",
    type: "text/css; charset=utf-8"
  },
  "/api/assets/styles.css": {
    file: "styles.css",
    type: "text/css; charset=utf-8"
  },
  "/assets/view.js": {
    file: "view.js",
    type: "text/javascript; charset=utf-8"
  },
  "/api/assets/view.js": {
    file: "view.js",
    type: "text/javascript; charset=utf-8"
  }
};

export async function sendStaticAsset(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const asset = STATIC_ASSETS[url.pathname] || agentLogoAsset(url);
  if (!asset) return false;

  const filePath = path.join(ASSET_ROOT, asset.file);
  const info = await stat(filePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return false;
  response.writeHead(200, {
    "content-type": asset.type,
    "content-length": info.size,
    "cache-control": "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
  return true;
}

function agentLogoAsset(url) {
  const pathname = agentLogoPathname(url);
  const match = /^\/(?:api\/)?assets\/agents\/([a-z0-9_-]+\.(?:png|svg|webp))$/.exec(pathname);
  if (!match) return null;
  const extension = path.extname(match[1]).toLowerCase();
  return {
    file: path.join("agents", match[1]),
    type: imageContentType(extension)
  };
}

function agentLogoPathname(url) {
  if (url.pathname === "/api/assets/agents") {
    const file = url.searchParams.get("file") || "";
    if (/^[a-z0-9_-]+\.(?:png|svg|webp)$/.test(file)) {
      return `/assets/agents/${file}`;
    }
  }
  return url.pathname;
}

function imageContentType(extension) {
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/svg+xml; charset=utf-8";
}
