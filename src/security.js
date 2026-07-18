import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VIEW_COOKIE = "brain_view_auth";
const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function isMcpRequestAuthorized(request) {
  const secret = process.env.BRAIN_MCP_SECRET || process.env.MCP_SECRET || "";
  if (!secret) return true;
  const url = requestUrl(request);
  const provided =
    request.headers["x-brain-mcp-secret"] ||
    bearerToken(request.headers.authorization || "") ||
    url.searchParams.get("key") ||
    url.searchParams.get("secret");
  return safeEqual(provided, secret);
}

export function hasViewPassword() {
  return Boolean(viewPassword() || viewPasswordHash());
}

export function requiresViewPassword() {
  return process.env.BRAIN_ALLOW_UNPROTECTED_VIEW !== "true";
}

export function isViewAuthorized(request) {
  if (!requiresViewPassword()) return true;
  if (!hasViewPassword()) return false;
  const cookies = parseCookies(request.headers.cookie || "");
  return safeEqual(cookies[VIEW_COOKIE], signViewCookie());
}

export async function handleViewLogin(request, response) {
  if (!hasViewPassword()) {
    sendViewSetupRequired(response);
    return;
  }
  const body = await readBody(request);
  const params = new URLSearchParams(body);
  const password = params.get("password") || "";
  const redirectHash = safeRedirectHash(params.get("redirect_hash") || "");
  if (!verifyViewPassword(password)) {
    sendHtml(response, 401, renderLoginPage({ invalid: true }));
    return;
  }
  response.writeHead(303, {
    "set-cookie": `${VIEW_COOKIE}=${signViewCookie()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${VIEW_COOKIE_MAX_AGE}${secureCookieSuffix(request)}`,
    location: `/${redirectHash}`
  });
  response.end();
}

export function sendViewLogin(response, { invalid = false } = {}) {
  if (!hasViewPassword()) {
    sendViewSetupRequired(response);
    return;
  }
  sendHtml(response, invalid ? 401 : 200, renderLoginPage({ invalid }));
}

export function sendMissingRedisRequired(response) {
  sendHtml(response, 503, renderMissingRedisRequiredPage());
}

export function getViewSecurityInfo() {
  return {
    requires_view_password: requiresViewPassword(),
    view_password_configured: hasViewPassword(),
    mcp_secret_required: Boolean(process.env.BRAIN_MCP_SECRET || process.env.MCP_SECRET || "")
  };
}

export function getLaunchInfo() {
  const viewUrl = normalizeBaseUrl(process.env.BRAIN_VIEW_URL || "");
  const mcpSecret = process.env.BRAIN_MCP_SECRET || process.env.MCP_SECRET || "";
  return {
    view_url: viewUrl,
    mcp_url: mcpUrlFor({ viewUrl, mcpSecret }),
    mcp_secret_configured: Boolean(mcpSecret),
    view_password_configured: hasViewPassword()
  };
}

export function mcpUrlFor({ viewUrl, mcpSecret }) {
  const base = normalizeBaseUrl(viewUrl);
  if (!base) return "";
  const endpoint = `${base}/api/mcp`;
  return mcpSecret ? `${endpoint}?key=${encodeURIComponent(mcpSecret)}` : endpoint;
}

export function hashViewPassword(password, salt = randomBytes(16).toString("hex")) {
  const digest = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `sha256:${salt}:${digest}`;
}

function viewPassword() {
  return process.env.BRAIN_VIEW_PASSWORD || process.env.VIEW_PASSWORD || "";
}

function viewPasswordHash() {
  return process.env.BRAIN_VIEW_PASSWORD_HASH || process.env.VIEW_PASSWORD_HASH || "";
}

function verifyViewPassword(password) {
  const hash = viewPasswordHash();
  if (hash) return safeEqual(hashViewPassword(password, hashSalt(hash)), hash);
  return safeEqual(password, viewPassword());
}

function hashSalt(hash) {
  return String(hash || "").split(":")[1] || "";
}

function signViewCookie() {
  const credential = viewPasswordHash() || viewPassword();
  return createHmac("sha256", credential).update("brain-view").digest("hex");
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function bearerToken(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function requestUrl(request) {
  return new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
}

function safeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  if (!leftText || !rightText) return false;
  const leftBuffer = Buffer.from(leftText);
  const rightBuffer = Buffer.from(rightText);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function secureCookieSuffix(request) {
  const proto = request.headers["x-forwarded-proto"];
  return proto === "https" ? "; Secure" : "";
}

function safeRedirectHash(value) {
  const hash = String(value || "");
  return /^#node=obj_[a-z0-9_]+$/.test(hash) ? hash : "";
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/#.*$/, "").replace(/\/$/, "");
}

function sendHtml(response, status, html) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendViewSetupRequired(response) {
  sendHtml(response, 503, renderSetupRequiredPage());
}

function setupDefaultViewUrl() {
  return normalizeBaseUrl(process.env.BRAIN_VIEW_URL || "") || "https://your-brain.example.com";
}

function renderLoginPage({ invalid }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Second Brain</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Segoe UI Variable Text", Aptos, Inter, ui-sans-serif, system-ui, sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      body {
        min-height: 100vh;
        margin: 0;
        padding: 1rem;
        background: Canvas;
        color: CanvasText;
        text-align: center;
      }
      main {
        width: min(26rem, calc(100% - 2rem));
        display: inline-block;
        margin-top: 16vh;
        padding: 1rem;
        border: thin solid color-mix(in srgb, CanvasText 14%, Canvas 86%);
        border-radius: 0.5rem;
        background: color-mix(in srgb, CanvasText 3%, Canvas 97%);
        text-align: left;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.25rem;
      }
      label,
      input,
      button {
        display: block;
        width: 100%;
      }
      label {
        margin-bottom: 0.375rem;
        color: color-mix(in srgb, CanvasText 68%, Canvas 32%);
        font-size: 0.875rem;
      }
      input {
        margin-bottom: 0.75rem;
        padding: 0.625rem 0.75rem;
        border: thin solid color-mix(in srgb, CanvasText 18%, Canvas 82%);
        border-radius: 0.5rem;
        background: Canvas;
        color: CanvasText;
        font: inherit;
      }
      button {
        padding: 0.625rem 0.75rem;
        border: thin solid color-mix(in srgb, #2563eb 46%, CanvasText 10%);
        border-radius: 0.5rem;
        background: color-mix(in srgb, #2563eb 14%, Canvas 86%);
        color: CanvasText;
        cursor: pointer;
        font: inherit;
        font-weight: 650;
      }
      .error {
        margin: 0 0 0.75rem;
        color: #dc2626;
        font-size: 0.875rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>AI Second Brain</h1>
      ${invalid ? '<p class="error">Incorrect password.</p>' : ""}
      <form method="post">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" autofocus>
        <input id="redirect_hash" name="redirect_hash" type="hidden">
        <button type="submit">Enter</button>
      </form>
    </main>
    <script>
      document.getElementById("redirect_hash").value = window.location.hash || "";
    </script>
  </body>
</html>`;
}

function renderSetupRequiredPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Second Brain</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Segoe UI Variable Text", Aptos, Inter, ui-sans-serif, system-ui, sans-serif;
      }
      body {
        min-height: 100vh;
        margin: 0;
        padding: 1rem;
        background: Canvas;
        color: CanvasText;
        text-align: center;
      }
      * {
        box-sizing: border-box;
      }
      main {
        width: min(46rem, calc(100% - 2rem));
        display: inline-block;
        margin-top: 8vh;
        padding: 1.125rem;
        border: thin solid color-mix(in srgb, CanvasText 14%, Canvas 86%);
        border-radius: 0.5rem;
        background: color-mix(in srgb, CanvasText 3%, Canvas 97%);
        text-align: left;
      }
      label,
      input,
      textarea {
        display: block;
        width: 100%;
        font: inherit;
      }
      label {
        margin-top: 0.75rem;
        margin-bottom: 0.375rem;
        color: color-mix(in srgb, CanvasText 68%, Canvas 32%);
        font-size: 0.875rem;
      }
      input,
      textarea {
        max-width: 100%;
        border: thin solid color-mix(in srgb, CanvasText 18%, Canvas 82%);
        border-radius: 0.5rem;
        padding: 0.625rem 0.75rem;
        background: Canvas;
        color: CanvasText;
      }
      textarea,
      code {
        display: block;
        width: 100%;
        margin-top: 0.75rem;
        padding: 0.75rem;
        border: thin solid color-mix(in srgb, CanvasText 12%, Canvas 88%);
        border-radius: 0.5rem;
        background: color-mix(in srgb, CanvasText 8%, Canvas 92%);
        overflow-wrap: anywhere;
      }
      textarea {
        min-height: 11.5rem;
        resize: vertical;
      }
      code {
        min-height: 0;
        font-size: 0.875rem;
      }
      button {
        width: auto;
        display: inline-block;
        margin-top: 0.75rem;
        border: thin solid color-mix(in srgb, #2563eb 46%, CanvasText 10%);
        border-radius: 0.5rem;
        padding: 0.625rem 0.75rem;
        background: color-mix(in srgb, #2563eb 14%, Canvas 86%);
        color: CanvasText;
        cursor: pointer;
        font-weight: 650;
      }
      .secondary {
        margin-left: 0.5rem;
        border-color: color-mix(in srgb, CanvasText 18%, Canvas 82%);
        background: Canvas;
      }
      .action-link {
        color: #2563eb;
        font-weight: 650;
      }
      .hint,
      .step {
        color: color-mix(in srgb, CanvasText 68%, Canvas 32%);
      }
      .step {
        margin-top: 0.75rem;
      }
      .hidden {
        display: none;
      }
      @media (max-width: 34rem) {
        body {
          padding: 0.75rem;
        }
        main {
          width: 100%;
          margin-top: 4vh;
          padding: 0.875rem;
        }
        button,
        .secondary {
          width: 100%;
          margin-left: 0;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Initialize AI Second Brain</h1>
      <p class="hint">The view is protected by default. Choose a password, then copy the generated variables into the Vercel environment that serves this URL.</p>
      <p class="hint">Redis is required on Vercel. <a class="action-link" href="https://vercel.com/marketplace/upstash" target="_blank" rel="noreferrer">Install Upstash Redis on Vercel</a>, then create a new deployment after Vercel adds the Redis variables.</p>
      <label for="view-url">View URL</label>
      <input id="view-url" type="url" value="${setupDefaultViewUrl()}">
      <label for="password">View password</label>
      <input id="password" type="password" autocomplete="new-password" autofocus>
      <button id="generate" type="button">Generate variables</button>
      <button id="copy" class="secondary hidden" type="button">Copy</button>
      <p class="step hidden" id="next-step">Add these variables in Vercel, create a new deployment, then return to this page. If this setup screen still appears, the deployment cannot see BRAIN_VIEW_PASSWORD_HASH.</p>
      <textarea id="env-output" class="hidden" readonly></textarea>
      <code id="mcp-output" class="hidden"></code>
    </main>
    <script>
      (function () {
        var viewUrl = document.getElementById("view-url");
        var password = document.getElementById("password");
        var generate = document.getElementById("generate");
        var copy = document.getElementById("copy");
        var envOutput = document.getElementById("env-output");
        var mcpOutput = document.getElementById("mcp-output");
        var nextStep = document.getElementById("next-step");

        generate.addEventListener("click", async function () {
          var url = normalizeUrl(viewUrl.value);
          if (!url || !password.value) return;
          var mcpSecret = randomSecret();
          var passwordHash = await hashPassword(password.value);
          var mcpUrl = url + "/api/mcp?key=" + encodeURIComponent(mcpSecret);
          var envText = [
            "BRAIN_VIEW_URL=" + url,
            "BRAIN_MCP_SECRET=" + mcpSecret,
            "BRAIN_VIEW_PASSWORD_HASH=" + passwordHash
          ].join("\\n");
          envOutput.value = envText;
          mcpOutput.textContent = "MCP URL: " + mcpUrl;
          envOutput.classList.remove("hidden");
          mcpOutput.classList.remove("hidden");
          nextStep.classList.remove("hidden");
          copy.classList.remove("hidden");
        });

        copy.addEventListener("click", async function () {
          await navigator.clipboard.writeText(envOutput.value);
          copy.textContent = "Copied";
          window.setTimeout(function () { copy.textContent = "Copy"; }, 1400);
        });

        async function hashPassword(value) {
          var salt = randomHex(16);
          var digest = await sha256Hex(salt + ":" + value);
          return "sha256:" + salt + ":" + digest;
        }

        async function sha256Hex(value) {
          var bytes = new TextEncoder().encode(value);
          var hash = await crypto.subtle.digest("SHA-256", bytes);
          return Array.from(new Uint8Array(hash)).map(function (byte) {
            return byte.toString(16).padStart(2, "0");
          }).join("");
        }

        function randomSecret() {
          return base64Url(crypto.getRandomValues(new Uint8Array(24)));
        }

        function randomHex(length) {
          var bytes = crypto.getRandomValues(new Uint8Array(length));
          return Array.from(bytes).map(function (byte) {
            return byte.toString(16).padStart(2, "0");
          }).join("");
        }

        function base64Url(bytes) {
          var binary = Array.from(bytes).map(function (byte) {
            return String.fromCharCode(byte);
          }).join("");
          return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
        }

        function normalizeUrl(value) {
          return String(value || "").trim().replace(/\\/$/, "");
        }
      })();
    </script>
  </body>
</html>`;
}

function renderMissingRedisRequiredPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Second Brain Setup Required</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Segoe UI Variable Text", Aptos, Inter, ui-sans-serif, system-ui, sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      body {
        min-height: 100vh;
        margin: 0;
        padding: 1rem;
        background: Canvas;
        color: CanvasText;
        text-align: center;
      }
      main {
        width: min(42rem, calc(100% - 2rem));
        display: inline-block;
        margin-top: 12vh;
        padding: 1.125rem;
        border: thin solid color-mix(in srgb, CanvasText 14%, Canvas 86%);
        border-radius: 0.5rem;
        background: color-mix(in srgb, CanvasText 3%, Canvas 97%);
        text-align: left;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.25rem;
      }
      p,
      li {
        color: color-mix(in srgb, CanvasText 72%, Canvas 28%);
      }
      code {
        padding: 0.125rem 0.25rem;
        border-radius: 0.25rem;
        background: color-mix(in srgb, CanvasText 8%, Canvas 92%);
      }
      a {
        color: #2563eb;
        font-weight: 650;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Redis is required on Vercel</h1>
      <p>AI Second Brain needs Redis/KV storage for runtime writes on Vercel. The current deployment cannot see Redis environment variables, so the graph cannot be loaded safely.</p>
      <ol>
        <li><a href="https://vercel.com/marketplace/upstash" target="_blank" rel="noreferrer">Install Upstash Redis on Vercel</a> and attach it to this project.</li>
        <li>Confirm Vercel added <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code>, or <code>KV_REST_API_URL</code> and <code>KV_REST_API_TOKEN</code>.</li>
        <li>Create a new deployment, then reopen this page.</li>
      </ol>
    </main>
  </body>
</html>`;
}
