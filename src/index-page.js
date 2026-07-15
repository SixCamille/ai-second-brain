import { getLaunchInfo } from "./security.js";
import { assetPath } from "./view/asset-path.js";

export async function renderIndexPage(store) {
  const overview = await store.getOverview({ latestLimit: 0, activityLimit: 50, dueTaskLimit: 8 });
  const launchInfo = getLaunchInfo();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Second Brain MCP</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="${assetPath("/assets/styles.css")}">
  </head>
  <body>
    <main>
      <div class="intro">
        <div class="intro-text">
          <h1>Second Brain MCP</h1>
          <p>Structured JSON memory organized as objects and relations. Click a node to read its details and connections.</p>
        </div><!--
        --><div class="metrics" aria-label="Statistics">
          <div class="metric">
            <strong>${overview.objectCount}</strong>
            <span>Nodes</span>
          </div><!--
          --><div class="metric">
            <strong>${overview.relationCount}</strong>
            <span>Relations</span>
          </div>
        </div>
      </div>
      <div class="layout">
        <section class="graph-wrap" aria-labelledby="graph-title">
          <div class="panel">
            <div class="graph-header">
              <div>
                <h2 id="graph-title">Visual Map</h2>
                <p id="graph-caption">${overview.nodes.length} loaded nodes</p>
              </div><!--
              --><div class="graph-actions">
                <button class="icon-button" id="zoom-out" type="button" aria-label="Zoom out">-</button>
                <button class="icon-button" id="zoom-in" type="button" aria-label="Zoom in">+</button>
                <button class="plain-button" id="search-toggle" type="button" aria-haspopup="dialog" aria-controls="search-popover" aria-expanded="false">Search</button>
              </div>
            </div>
          </div>
          <div class="graph" id="graph" aria-label="Node graph"></div>
          <div class="graph-focus" id="graph-focus"></div>
        </section><!--
        --><aside class="panel detail" aria-labelledby="detail-title">
          <div class="detail-head" id="detail"></div>
          <div class="section-stack content-section">
            <div class="content-head">
              <h3>Content</h3><!--
              --><span class="content-head-action"><button class="content-detail-button" id="content-open" type="button">View details</button></span>
            </div>
            <div id="content"></div>
          </div>
          <div class="section-stack relations-section">
            <h3>Relations</h3>
            <div id="relations"></div>
          </div>
        </aside>
      </div>
      <section class="latest-section" aria-label="Recent activity">
        <div class="panel section-stack history-panel">
          <h2>History</h2>
          ${renderActivity(overview.activity, overview.kinds)}
        </div><!--
        --><div class="panel section-stack deadlines-panel">
          <h2>Deadlines</h2>
          ${renderDueTasks(overview.dueTasks)}
          ${renderCompletedNodes(overview.completedNodes)}
        </div>
      </section>
      <footer class="app-footer">
        <button class="plain-button" id="launch-toggle" type="button" aria-haspopup="dialog" aria-controls="launch-popover" aria-expanded="false">MCP</button><!--
        --><code>/mcp</code>
      </footer>
      <div class="search-popover" id="search-popover" role="dialog" aria-modal="true" aria-labelledby="search-title">
        <div class="search-card">
          <div class="search-card-head">
            <div class="search-card-title"><h2 id="search-title">Search</h2></div><!--
            --><div class="search-card-close"><button class="icon-button" id="search-close" type="button" aria-label="Close">&times;</button></div>
          </div>
          <input class="search" id="search" type="search" placeholder="Search a node" autocomplete="off">
          <div class="nodes" id="node-list"></div>
        </div>
      </div>
      <div class="content-popover" id="content-popover" role="dialog" aria-modal="true" aria-labelledby="content-popover-title">
        <div class="content-card">
          <div class="content-card-head">
            <div class="content-card-title"><h2 id="content-popover-title">Node Content</h2></div><!--
            --><div class="content-card-close"><button class="icon-button" id="content-close" type="button" aria-label="Close">&times;</button></div>
          </div>
          <div id="content-detail"></div>
        </div>
      </div>
      <div class="launch-popover" id="launch-popover" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <div class="launch-card">
          <div class="content-card-head">
            <div class="content-card-title"><h2 id="launch-title">MCP Access</h2></div><!--
            --><div class="content-card-close"><button class="icon-button" id="launch-close" type="button" aria-label="Close">&times;</button></div>
          </div>
          <div class="launch-row">
            <h3>MCP URL</h3>
            <code class="launch-value" id="launch-mcp-url">Not configured</code>
          </div>
          <div class="launch-row">
            <h3>View</h3>
            <code class="launch-value" id="launch-view-url">Not configured</code>
          </div>
        </div>
      </div>
    </main>
    <script type="application/json" id="brain-data">${escapeScriptJson(overview.nodes)}</script>
    <script type="application/json" id="kind-data">${escapeScriptJson(overview.kinds)}</script>
    <script type="application/json" id="launch-data">${escapeScriptJson(launchInfo)}</script>
    <script defer src="${assetPath("/assets/view.js")}"></script>
  </body>
</html>`;
}

function renderKinds(kinds) {
  if (kinds.length === 0) {
    return `<p class="empty">No node type yet.</p>`;
  }
  return `<div class="kinds">${kinds
    .map(
      ({ kind, count }) =>
        `<div class="kind"><strong>${escapeHtml(kind)}</strong><span>${count}</span></div>`
    )
    .join("")}</div>`;
}

function renderDueTasks(tasks = []) {
  if (tasks.length === 0) {
    return `<p class="empty">No active deadline.</p>`;
  }
  return `<ul class="deadline-list">${tasks
    .map((task) => {
      const state = deadlineStateClass(task.deadline_at);
      return `<li><button class="deadline-item ${escapeHtml(state)}" type="button" data-node-id="${escapeHtml(task.id)}">
        ${renderAgent(task.by)}<!--
        --><span class="deadline-date">${escapeHtml(formatDate(task.deadline_at))}</span><!--
        --><span class="deadline-title">${escapeHtml(task.title)}</span><!--
        --><span class="deadline-priority">${priorityBadge(task.priority)}</span>
      </button></li>`;
    })
    .join("")}</ul>`;
}

function renderCompletedNodes(nodes = []) {
  if (nodes.length === 0) {
    return "";
  }
  return `<div class="completed-group">
    <h3>Recently Completed</h3>
    <ul class="deadline-list completed-list">${nodes
      .map((node) => {
        const item = `
          ${renderAgent(node.by)}<!--
          --><span class="deadline-date completed-date">${escapeHtml(formatDate(node.completed_at))}</span><!--
          --><span class="deadline-title">${escapeHtml(node.title)}</span><!--
          --><span class="deadline-priority">${priorityBadge(node.priority)}</span>`;
        if (node.archived) {
          return `<li><span class="activity-item deadline-item deadline-item-completed">${item}</span></li>`;
        }
        return `<li><button class="deadline-item deadline-item-completed" type="button" data-node-id="${escapeHtml(node.id)}">${item}</button></li>`;
      })
      .join("")}</ul>
  </div>`;
}

function renderActivity(items = [], kinds = []) {
  if (items.length === 0) {
    return `<p class="empty">No recent action.</p>`;
  }
  const kindConfigByName = new Map(kinds.map((item) => [item.kind, item]));
  return `<ul class="activity-list">${items
    .map((item) => {
      const token = escapeHtml(cssToken(item.action));
      const relationEvent = isRelationAction(item.action);
      const kind = item.kind || (relationEvent ? "relation" : "node");
      const colors = kindColors(kind, kindConfigByName);
      const agent = renderAgent(item.by);
      const action = `<span class="activity-action activity-action-${escapeHtml(cssToken(item.action))}">${escapeHtml(formatAction(item.action))}</span>`;
      const kindTag = `<span class="activity-kind"><span class="tag" style="--tag-fill: ${escapeHtml(colors.fill)}; --tag-stroke: ${escapeHtml(colors.stroke)};">${escapeHtml(kind)}</span></span>`;
      const title = relationEvent ? renderRelationActivityTitle(item) : `<span class="activity-title">${escapeHtml(item.title)}</span>`;
      const meta = `<span class="activity-meta">${priorityBadge(item.priority)}</span>`;
      const date = `<span class="activity-date">${escapeHtml(formatDate(item.at))}</span>`;
      if (item.node_available && !relationEvent) {
        return `<li><button class="activity-clickable activity-row-${token}" type="button" data-node-id="${escapeHtml(item.id)}">${agent}${action}${kindTag}${meta}${title}${date}</button></li>`;
      }
      return `<li><span class="activity-item activity-static activity-row-${token}">${agent}${action}${kindTag}${meta}${title}${date}</span></li>`;
    })
    .join("")}</ul>`;
}

function renderAgent(by) {
  const label = normalizeAgentLabel(by);
  const logo = agentLogo(label);
  const initials = agentInitials(label);
  const src = assetPath(`/assets/agents/${logo}`);
  const image = `<img src="${src}" alt="" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block'">`;
  return `<span class="activity-agent" title="Agent ${escapeHtml(label)}">${image}<span class="activity-agent-fallback">${escapeHtml(initials)}</span></span>`;
}

function renderRelationActivityTitle(item) {
  const relation = item.relation || {};
  const from = relation.from || item.id || "source";
  const to = relation.to || relation.next_to || relation.previous_to || "target";
  return `<span class="activity-title activity-relation-title"><span>${escapeHtml(from)}</span><span class="activity-arrow">-&gt;</span><span>${escapeHtml(to)}</span></span>`;
}

function isRelationAction(action) {
  return action === "relate" || action === "update_relation" || action === "delete_relation";
}

function formatAction(action) {
  const labels = {
    create: "Created",
    update: "Updated",
    merge: "Fusion",
    relate: "Relation",
    update_relation: "Relation",
    delete_relation: "Deleted",
    archive: "Archived",
    delete: "Deleted"
  };
  return labels[action] || action || "Action";
}

function normalizeAgentLabel(value) {
  const label = String(value || "").trim();
  return label || "Agent";
}

function agentLogo(label) {
  const normalized = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("claude code") || normalized.includes("claudecode")) return "claudecode.png";
  if (normalized.includes("codex")) return "codex.png";
  if (normalized.includes("cursor")) return "cursor.png";
  if (normalized.includes("chatgpt") || normalized.includes("openai")) return "chatgpt.webp";
  if (normalized.includes("claude") || normalized.includes("anthropic")) return "claude.png";
  if (normalized.includes("gemini") || normalized.includes("google")) return "gemini.png";
  if (normalized.includes("grok") || normalized.includes("xai")) return "grok.webp";
  if (normalized.includes("perplexity")) return "perplexity.webp";
  if (normalized.includes("mistral")) return "mistral.png";
  if (normalized.includes("glm") || normalized.includes("zhipu")) return "glm.png";
  return "placeholder.svg";
}

function agentInitials(label) {
  const letters = String(label || "Agent").match(/[A-Za-z0-9]/g) || ["A"];
  return letters.slice(0, 2).join("").toUpperCase();
}

function shortPriority(priority) {
  return String(priority || "")
    .replace(/^Priority\s+/i, "")
    .trim();
}

function priorityBadge(priority) {
  const value = normalizePriority(priority);
  const label = shortPriority(value);
  return `<span class="priority-badge priority-badge-compact" title="Priority ${escapeHtml(label)}">${priorityIcon(value)}<span class="priority-badge-label">${escapeHtml(label)}</span></span>`;
}

function priorityIcon(priority) {
  const shape = priorityShape(priority);
  if (shape === "triangle") {
    return `<svg class="priority-badge-icon" viewBox="-10 -10 20 20" aria-hidden="true"><polygon class="priority-badge-shape" points="0,-8 8,7 -8,7"></polygon></svg>`;
  }
  if (shape === "square") {
    return `<svg class="priority-badge-icon" viewBox="-10 -10 20 20" aria-hidden="true"><rect class="priority-badge-shape" x="-7" y="-7" width="14" height="14"></rect></svg>`;
  }
  return `<svg class="priority-badge-icon" viewBox="-10 -10 20 20" aria-hidden="true"><circle class="priority-badge-shape" r="7"></circle></svg>`;
}

function priorityShape(priority) {
  if (priority <= 0.3) return "square";
  if (priority >= 0.7) return "triangle";
  return "circle";
}

function normalizePriority(priority) {
  const value = typeof priority === "number" && Number.isFinite(priority) ? priority : 0.5;
  return Math.min(1, Math.max(0, value));
}

function cssToken(value) {
  return String(value || "action").replace(/[^a-z0-9_-]/gi, "_");
}

function kindColors(kind, kindConfigByName) {
  const configured = kindConfigByName.get(kind);
  if (configured?.color?.fill && configured?.color?.stroke) {
    return configured.color;
  }
  const hue = hashHue(kind);
  return {
    fill: `hsl(${hue} 72% 86%)`,
    stroke: `hsl(${hue} 64% 38%)`
  };
}

function hashHue(value) {
  let hash = 0;
  const text = String(value || "node");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 360;
  }
  return hash;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: "UTC"
    }).format(new Date(`${value}T00:00:00.000Z`));
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris"
  }).format(new Date(value));
}

function deadlineStateClass(value) {
  return deadlineTime(value) < Date.now() ? "deadline-item-overdue" : "deadline-item-active";
}

function deadlineTime(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T23:59:59.999Z`).getTime();
  }
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
