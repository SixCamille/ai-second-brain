import { createHash, randomUUID } from "node:crypto";
import { BrainStore, McpError } from "./brain-store.js";
import { missingRedisMessage, missingRequiredRedisOnVercel } from "./runtime-requirements.js";
import { getViewSecurityInfo, isMcpRequestAuthorized } from "./security.js";

const PROTOCOL_VERSION = "2025-06-18";
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const RECONNECT_COOLDOWN_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSIONS_PER_CLIENT = 12;
const ACTOR_DESCRIPTION = "Optional actor label for audit events. Use the agent product/family name, for example Codex, ChatGPT, Claude, Claude Code, Cursor, Gemini, Grok, Perplexity, Mistral or GLM; do not use the human user's name.";
const MEMORY_INSTRUCTIONS = [
  "AI Second Brain stores durable user-specific memory as JSON objects connected by untyped weighted relations.",
  "Call get_rules before any memory mutation; use it for the strategic entry point and user-specific instructions. user_instructions.md has priority when it specifies or overrides expected behavior.",
  "Use get_rule for focused guidance when it is relevant: editing_rules.md for object/content decisions, empty_brain.md for bootstrapping a blank graph, kind.md for kind selection, relations.md for graph links, and memory_policy.md for what deserves memory.",
  "Technical operation details live in the MCP tool descriptions and schemas.",
  "Mutating tools expect rules_acknowledged: true once the applicable guidance has been considered.",
  "Search before creating; read before replacing or removing content; prefer precise field/content/relation tools over broad updates.",
  "For mutation by fields, identify the acting agent product/family such as Codex, ChatGPT, Claude, Claude Code, Cursor, Gemini, Grok, Perplexity, Mistral or GLM, not the human user.",
  "When a task or project has an explicit due date, store it as object.dates.deadline_at or object.deadline_at in ISO format, not only in prose.",
  "When a task or project is finished, store it as object.dates.completed_at or object.completed_at in ISO format.",
  "Update existing objects when they represent the same meaning, but do not let consolidation hide distinct durable entities that deserve their own nodes.",
  "When creating a node, treat explicitly mentioned durable linked entities as part of the same mutation pass: search for each, reuse or create missing grounded nodes, and link them.",
  "Do not leave a new node isolated when the source information names a durable person, organization, concept, resource, event or reusable theme that can be linked without invention.",
  "Do not store public facts as standalone objects; keep them only as justification for a personal project, decision, constraint or reasoning."
].join(" ");

const RULE_NAMES = ["README.md", "editing_rules.md", "empty_brain.md", "kind.md", "relations.md", "memory_policy.md"];

const DESCRIPTIONS = {
  search: [
    "Search current memory objects before creating or linking.",
    "Use one query for a direct lookup, or queries for exploratory anti-duplicate search across synonyms, project names, people, tools and domains.",
    "Results are active objects by default, sorted by recency/relevance; set kind to narrow the object type and include_archived to inspect archived history."
  ].join(" "),
  read: [
    "Read one object by id, including content, relations and dates.",
    "Use before replacing/removing content, before deciding whether an existing object should be updated, and whenever search results are not enough.",
    "Set touch only when the object was actually used as current context and last_seen_at should move."
  ].join(" "),
  findRelated: [
    "Follow explicit relations from one object to inspect its local graph.",
    "Use after read when deciding whether to add links, avoid duplicate pivots, or understand nearby projects, people, resources and constraints.",
    "depth defaults low; increase only when broader graph context is useful."
  ].join(" "),
  buildContextPack: [
    "Build a compact task-oriented context pack for a query.",
    "Use when the user asks about a topic and you need a concise memory synthesis rather than full object records.",
    "It is read-only and suited for grounding answers before deciding whether any mutation is needed."
  ].join(" "),
  exportNodesSummary: [
    "Export current memory nodes without content details.",
    "Use for audits, graph overviews, deduplication passes or broad planning; it returns ids, kinds, titles, summaries, priority, dates, relation counts and relation targets.",
    "It intentionally omits content; call read for a node before editing its durable details."
  ].join(" "),
  listDueTasks: [
    "List active, unfinished task objects sorted by deadline, priority and freshness.",
    "Tasks with dates.completed_at are excluded.",
    "Use due_before to keep only tasks due on or before an ISO date or datetime; a date-only value includes the full day.",
    "Set include_no_deadline when planning should include tasks without a deadline."
  ].join(" "),
  getViewLink: [
    "Return the configured AI Second Brain web view URL, optionally deep-linked to #node=<id>.",
    "Use when the user wants to open or inspect the memory graph visually.",
    "The base URL comes from BRAIN_VIEW_URL or config.view_url."
  ].join(" "),
  readObjectEvents: [
    "Read the automatic event log for one memory object.",
    "Use for audit, debugging, history lookup or explaining how a node changed.",
    "Agents do not write these events manually."
  ].join(" "),
  getRules: [
    "Return only the strategic rules entry point README.md plus user_instructions.md.",
    "This tool intentionally does not return editing_rules.md, empty_brain.md, kind.md, relations.md, or memory_policy.md.",
    "User instructions are editable, user-specific complements and have priority when they specify or override AI Second Brain behavior.",
    "Before any mutation, use get_rule for each detailed strategic rule that applies to the current decision.",
    "Do not expect this tool to return every rules/*.md file; technical tool usage is described by MCP schemas and descriptions."
  ].join(" "),
  getRule: [
    "Return one allowed strategic rule file by exact name.",
    "Use editing_rules.md for creation/update/consolidation strategy, empty_brain.md for bootstrapping a blank graph, kind.md for choosing or creating kinds, relations.md for graph link policy, and memory_policy.md for deciding what deserves memory.",
    "This is targeted lookup, not a bulk rules loader."
  ].join(" "),
  getUserInstructions: [
    "Read the user-specific Markdown instructions file.",
    "These instructions complement AI Second Brain's structural rules and have priority when they specify or override expected behavior."
  ].join(" "),
  setUserInstructions: [
    "Replace the whole user-specific Markdown instructions file.",
    "Use this for personal preferences or rules without changing AI Second Brain's immutable structural rules.",
    "The content is limited to 32768 UTF-8 bytes."
  ].join(" "),
  listKinds: [
    "Return registered object kind names from the operational kind registry.",
    "Use before choosing a kind for a new or updated object.",
    "If no existing kind fits a reusable category, use add_kind after reading rules."
  ].join(" "),
  listKindConfigs: [
    "Return registered object kinds with visual color configuration { fill, stroke }.",
    "Use before changing kind colors, building visual UI, or auditing kind configuration.",
    "For names only, prefer list_kinds."
  ].join(" "),
  addKind: [
    "Register a reusable object kind in the kind registry.",
    "Use only when list_kinds shows no existing kind accurately describes a durable, reusable category.",
    "Provide optional color { fill, stroke } for graph/tag display; otherwise a palette color is assigned.",
    "Existing kinds are kept and returned as not newly created."
  ].join(" "),
  updateKind: [
    "Update the visual color { fill, stroke } of an existing kind.",
    "This changes graph/tag display only and does not alter object meaning or objects using the kind.",
    "Use list_kind_configs first to inspect current colors."
  ].join(" "),
  createObject: [
    "Create one new durable memory object; it refuses existing ids and never merges automatically.",
    "Search first to avoid duplicates; if a matching object exists, update it instead.",
    "Use for durable entities, tasks, projects, decisions, preferences, routines, resources, people, organizations or reusable pivots that may be useful later.",
    "A new object must handle its explicit durable linked nodes in the same pass: search for each mentioned person, organization, concept, resource, event or reusable theme, create missing grounded nodes that deserve independent retrieval, and add relations.",
    "Keep summary short, put durable details in content lines, set priority 0..1 for importance, and store deadline_at/completed_at as ISO dates/datetimes when applicable.",
    "Add outgoing relations in the same call with relations: [{ to, importance }] when linked nodes are known; duplicate direct/reverse relations are skipped with warnings."
  ].join(" "),
  setTitle: "Update only the title of an existing object. Use for renaming while preserving kind, summary, content, dates and relations.",
  setKind: [
    "Update only the kind of an existing object.",
    "Use list_kinds first when unsure; use add_kind first only if a durable reusable category is missing.",
    "Changing kind changes classification, not content or relations."
  ].join(" "),
  setSummary: "Update only the short summary of an existing object. Keep it concise and stable; put detailed durable facts in content.",
  setPriority: [
    "Update only numeric priority between 0 and 1.",
    "Priority describes intrinsic importance, not deadline urgency.",
    "Use deadline_at for temporal urgency."
  ].join(" "),
  setDeadline: [
    "Set or clear dates.deadline_at on an existing object.",
    "Accepts an ISO date or datetime with optional precise time; pass an empty string to clear.",
    "Use for tasks or projects with an explicit due date instead of storing the deadline only in prose."
  ].join(" "),
  setCompleted: [
    "Set or clear dates.completed_at on an existing object.",
    "Use when a task or project is finished; pass an empty string to clear.",
    "archive_object also sets completed_at when archiving an unfinished object."
  ].join(" "),
  updateObject: [
    "Update several metadata fields on one existing object in a single explicit mutation.",
    "Accepts title, kind, summary, priority, deadline_at, completed_at and optional outgoing relations.",
    "It never edits content; use add_content, replace_content or remove_content for durable content lines.",
    "Use when metadata changes belong together, or when adding relations while updating metadata.",
    "It can also receive only relations to add links without touching metadata; duplicates are skipped with warnings."
  ].join(" "),
  addContent: [
    "Append durable content lines to an existing object.",
    "Preserves existing content and de-duplicates exact lines.",
    "Use for new stable facts, constraints, rationale or context that belong inside the same object."
  ].join(" "),
  replaceContent: [
    "Replace all content lines on an existing object.",
    "Use only after reading the object and verifying the replacement preserves the durable information that should remain.",
    "Do not use for small additions or removals; prefer add_content or remove_content."
  ].join(" "),
  removeContent: [
    "Remove exact content lines from an existing object.",
    "Use after reading the object when specific lines are obsolete, wrong or duplicated.",
    "It matches exact lines; rewrite with replace_content only when a broader content cleanup is intentional."
  ].join(" "),
  createRelation: [
    "Create one untyped weighted link between two objects.",
    "Relations store only { to, importance }; they have no type, label, action or hierarchy.",
    "A pair of objects can have at most one relation regardless of direction.",
    "When the pair already exists, no write happens and the result reports status already_exists with a duplicate_relation warning.",
    "Use after search/read when the link improves durable navigation or understanding; importance defaults to 0.5 and must be > 0 and <= 1."
  ].join(" "),
  updateRelation: [
    "Update an existing untyped link identified by from_id and to_id.",
    "Provide new_to_id, importance, or both.",
    "Use when the target changed or the strength was wrong; do not add relation types or labels."
  ].join(" "),
  deleteRelation: [
    "Delete an existing untyped link identified by from_id and to_id.",
    "Use when a relation is stale, wrong, duplicated in meaning, or no longer useful.",
    "Deleting a relation does not delete either object."
  ].join(" "),
  deleteObject: [
    "Exceptionally delete an object created by mistake, only when it has no outgoing or incoming relations.",
    "Use archive_object instead when the node has historical value, relations, completion state, or should simply disappear from normal context.",
    "Requires a reason."
  ].join(" "),
  deleteObjectCascade: [
    "Exceptionally delete an object after removing all incoming and outgoing relations.",
    "Use only when physical deletion is intentional; prefer archive_object for completed, historical or uncertain nodes.",
    "Requires a reason and refuses to alter archived objects or archived relation endpoints."
  ].join(" "),
  archiveObject: [
    "Mark an object as archived without physically deleting it.",
    "Use for completed tasks, mistaken/obsolete/duplicate nodes that should leave normal search/context, or objects that cannot be deleted because relations should be preserved.",
    "Archiving keeps relations, adds dates.archived_at and sets dates.completed_at when missing.",
    "Archived objects are frozen: edit, content and relation tools refuse to modify them or their links."
  ].join(" ")
};

export const TOOLS = [
  tool("search", DESCRIPTIONS.search, {
    type: "object",
    properties: {
      query: { type: "string", description: "Single search string for a direct lookup." },
      queries: {
        type: "array",
        description: "Several exploratory search strings for anti-duplicate and related-context lookup.",
        items: { type: "string" }
      },
      kind: { type: "string", description: "Optional kind filter such as task, project, decision or resource." },
      limit: { type: "integer", minimum: 1, description: "Maximum number of objects to return." },
      include_archived: { type: "boolean", description: "Include archived objects explicitly; defaults to false." }
    }
  }),
  tool("read", DESCRIPTIONS.read, {
    type: "object",
    properties: {
      id: { type: "string", description: "Object id, for example obj_brain_mcp." },
      touch: { type: "boolean", description: "Update last_seen_at when this read is used as current context." }
    },
    required: ["id"]
  }),
  tool("find_related", DESCRIPTIONS.findRelated, {
    type: "object",
    properties: {
      id: { type: "string", description: "Starting object id." },
      depth: { type: "integer", minimum: 1, description: "Relation traversal depth." }
    },
    required: ["id"]
  }),
  tool("build_context_pack", DESCRIPTIONS.buildContextPack, {
    type: "object",
    properties: {
      query: { type: "string", description: "Topic or user request to ground in memory." },
      limit: { type: "integer", minimum: 1, description: "Maximum number of relevant objects to include." }
    },
    required: ["query"]
  }),
  tool("export_nodes_summary", DESCRIPTIONS.exportNodesSummary, {
    type: "object",
    properties: {
      kind: { type: "string", description: "Optional kind filter." },
      include_archived: { type: "boolean", description: "Include archived objects explicitly." }
    }
  }),
  tool("list_due_tasks", DESCRIPTIONS.listDueTasks, {
    type: "object",
    properties: {
      due_before: { type: "string", description: "ISO date or datetime upper bound. Date-only values include the full day." },
      include_no_deadline: { type: "boolean", description: "Include active tasks with no deadline." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Maximum number of tasks to return." }
    }
  }),
  tool("get_view_link", DESCRIPTIONS.getViewLink, {
    type: "object",
    properties: {
      id: { type: "string", pattern: "^obj_[a-z0-9_]+$", description: "Optional node id to deep-link in the graph view." }
    }
  }),
  tool("read_object_events", DESCRIPTIONS.readObjectEvents, {
    type: "object",
    properties: {
      id: { type: "string", description: "Object id whose event log should be read." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Maximum number of latest events to return." }
    },
    required: ["id"]
  }),
  tool("get_rules", DESCRIPTIONS.getRules, {
    type: "object",
    properties: {}
  }),
  tool("get_rule", DESCRIPTIONS.getRule, {
    type: "object",
    properties: {
      name: {
        type: "string",
        enum: RULE_NAMES,
        description: "Exact strategic rule filename to read."
      }
    },
    required: ["name"]
  }),
  tool("get_user_instructions", DESCRIPTIONS.getUserInstructions, {
    type: "object",
    properties: {}
  }),
  tool("set_user_instructions", DESCRIPTIONS.setUserInstructions, {
    type: "object",
    properties: {
      content: {
        type: "string",
        maxLength: 32768,
        description: "Complete Markdown content replacing user_instructions.md."
      }
    },
    required: ["content"]
  }),
  tool("list_kinds", DESCRIPTIONS.listKinds, {
    type: "object",
    properties: {}
  }),
  tool("list_kind_configs", DESCRIPTIONS.listKindConfigs, {
    type: "object",
    properties: {}
  }),
  tool("add_kind", withMutationRequirement(DESCRIPTIONS.addKind), {
    type: "object",
    properties: {
      kind: { type: "string", description: "Lowercase reusable kind name; input is normalized." },
      color: kindColorSchema(),
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["kind", "rules_acknowledged"]
  }),
  tool("update_kind", withMutationRequirement(DESCRIPTIONS.updateKind), {
    type: "object",
    properties: {
      kind: { type: "string", description: "Existing kind name to update." },
      color: kindColorSchema(),
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["kind", "color", "rules_acknowledged"]
  }),
  tool("create_object", withMutationRequirement(DESCRIPTIONS.createObject), {
    type: "object",
    properties: {
      id: { type: "string", pattern: "^obj_[a-z0-9_]+$", description: "Optional explicit id; generated from title when omitted." },
      kind: { type: "string", description: "Object classification; defaults to idea if omitted." },
      title: { type: "string", description: "Human-readable object title." },
      summary: { type: "string", description: "Short stable summary." },
      priority: { type: "number", minimum: 0, maximum: 1, description: "Intrinsic importance from 0 to 1; defaults to 0.5." },
      content: contentSchema(),
      relations: relationsSchema(),
      deadline_at: { type: "string", description: "Optional ISO date/datetime for task/project deadline." },
      completed_at: { type: "string", description: "Optional ISO date/datetime when already completed." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["title", "rules_acknowledged"]
  }),
  tool("set_title", withMutationRequirement(DESCRIPTIONS.setTitle), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      title: { type: "string", description: "New title." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "title", "rules_acknowledged"]
  }),
  tool("set_kind", withMutationRequirement(DESCRIPTIONS.setKind), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      kind: { type: "string", description: "New object kind." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "kind", "rules_acknowledged"]
  }),
  tool("set_summary", withMutationRequirement(DESCRIPTIONS.setSummary), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      summary: { type: "string", description: "New short summary." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "summary", "rules_acknowledged"]
  }),
  tool("set_priority", withMutationRequirement(DESCRIPTIONS.setPriority), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      priority: { type: "number", minimum: 0, maximum: 1, description: "New intrinsic importance from 0 to 1." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "priority", "rules_acknowledged"]
  }),
  tool("set_deadline", withMutationRequirement(DESCRIPTIONS.setDeadline), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      deadline_at: { type: "string", description: "ISO date/datetime or empty string to clear." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "deadline_at", "rules_acknowledged"]
  }),
  tool("set_completed", withMutationRequirement(DESCRIPTIONS.setCompleted), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      completed_at: { type: "string", description: "ISO date/datetime or empty string to clear." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "completed_at", "rules_acknowledged"]
  }),
  tool("update_object", withMutationRequirement(DESCRIPTIONS.updateObject), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      title: { type: "string", description: "Optional new title." },
      kind: { type: "string", description: "Optional new kind." },
      summary: { type: "string", description: "Optional new short summary." },
      priority: { type: "number", minimum: 0, maximum: 1, description: "Optional new intrinsic importance." },
      relations: relationsSchema(),
      deadline_at: { type: "string", description: "Optional ISO date/datetime or empty string." },
      completed_at: { type: "string", description: "Optional ISO date/datetime or empty string." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "rules_acknowledged"]
  }),
  tool("add_content", withMutationRequirement(DESCRIPTIONS.addContent), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      content: contentSchema(),
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "content", "rules_acknowledged"]
  }),
  tool("replace_content", withMutationRequirement(DESCRIPTIONS.replaceContent), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      content: contentSchema(),
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "content", "rules_acknowledged"]
  }),
  tool("remove_content", withMutationRequirement(DESCRIPTIONS.removeContent), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      content: contentSchema(),
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "content", "rules_acknowledged"]
  }),
  tool("create_relation", withMutationRequirement(DESCRIPTIONS.createRelation), {
    type: "object",
    properties: {
      from_id: objectIdSchema("Source object id."),
      to_id: objectIdSchema("Target object id."),
      importance: { type: "number", exclusiveMinimum: 0, maximum: 1, description: "Optional link strength; defaults to 0.5." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["from_id", "to_id", "rules_acknowledged"],
    additionalProperties: false
  }),
  tool("update_relation", withMutationRequirement(DESCRIPTIONS.updateRelation), {
    type: "object",
    properties: {
      from_id: objectIdSchema("Current source object id."),
      to_id: objectIdSchema("Current target object id."),
      new_to_id: objectIdSchema("Optional replacement target object id."),
      importance: { type: "number", exclusiveMinimum: 0, maximum: 1, description: "Optional new link strength." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["from_id", "to_id", "rules_acknowledged"],
    additionalProperties: false
  }),
  tool("delete_relation", withMutationRequirement(DESCRIPTIONS.deleteRelation), {
    type: "object",
    properties: {
      from_id: objectIdSchema("Source object id for the relation to delete."),
      to_id: objectIdSchema("Target object id for the relation to delete."),
      reason: { type: "string", description: "Optional reason for audit clarity." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["from_id", "to_id", "rules_acknowledged"],
    additionalProperties: false
  }),
  tool("delete_object", withMutationRequirement(DESCRIPTIONS.deleteObject), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      reason: { type: "string", description: "Required deletion reason." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "reason", "rules_acknowledged"]
  }),
  tool("delete_object_cascade", withMutationRequirement(DESCRIPTIONS.deleteObjectCascade), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      reason: { type: "string", description: "Required deletion reason." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "reason", "rules_acknowledged"]
  }),
  tool("archive_object", withMutationRequirement(DESCRIPTIONS.archiveObject), {
    type: "object",
    properties: {
      id: objectIdSchema(),
      reason: { type: "string", description: "Required archive reason." },
      by: { type: "string", description: ACTOR_DESCRIPTION },
      rules_acknowledged: rulesAcknowledgedSchema()
    },
    required: ["id", "reason", "rules_acknowledged"]
  })
];

export function createMcpHandler({ storeFactory = () => BrainStore.create() } = {}) {
  const sessions = new Map();

  return async function handleMcp(request, response) {
    const sseLimitEnabled = isSseLimitEnabled();
    if (sseLimitEnabled) {
      closeIdleSessions(sessions);
    }
    setCors(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!isAllowedOrigin(request)) {
      sendJson(response, 403, { error: "forbidden_origin" });
      return;
    }
    if (!isMcpRequestAuthorized(request)) {
      sendJson(response, 401, { error: "unauthorized_mcp" });
      return;
    }
    if (request.method === "GET") {
      if (sseLimitEnabled) {
        acceptPassiveSse(request, response, sessions);
      } else {
        sendSseAccepted(response);
      }
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "GET, POST, OPTIONS");
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const accept = request.headers.accept || "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
      sendJson(response, 406, {
        error: "Client must accept both application/json and text/event-stream"
      });
      return;
    }

    let message;
    try {
      message = await readJsonBody(request);
    } catch {
      sendJson(response, 400, jsonRpcError(null, -32700, "Parse error"));
      return;
    }

    if (!isJsonRpcMessage(message)) {
      response.writeHead(202);
      response.end();
      return;
    }

    let sessionId = mcpSessionId(request);
    if (sseLimitEnabled) {
      recordActivity(sessions, request, sessionId);
    }

    if (!isJsonRpcRequest(message)) {
      response.writeHead(202);
      response.end();
      return;
    }

    if (missingRequiredRedisOnVercel() && message.method === "tools/call") {
      sendJson(response, 200, jsonRpcError(message.id, -32000, missingRedisMessage()));
      return;
    }
    const store = await storeFactory();
    const rpcResponse = await dispatch(store, message, request);
    const headers = {};
    if (message.method === "initialize") {
      sessionId = randomUUID();
      headers["Mcp-Session-Id"] = sessionId;
      if (sseLimitEnabled) {
        recordActivity(sessions, request, sessionId);
      }
    }
    sendJson(response, 200, rpcResponse, headers);
  };
}

export async function dispatch(store, message, request = { headers: {} }) {
  try {
    switch (message.method) {
      case "initialize":
        return jsonRpcResult(message.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "AI Second Brain", version: "0.1.0" },
          instructions: MEMORY_INSTRUCTIONS
        });
      case "tools/list":
        return jsonRpcResult(message.id, { tools: TOOLS });
      case "tools/call":
        return jsonRpcResult(message.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(await callTool(store, message.params || {}), null, 2)
            }
          ]
        });
      default:
        return jsonRpcError(message.id, -32601, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    const code = error instanceof McpError ? error.code : -32000;
    return jsonRpcError(message.id, code, error.message);
  }
}

async function callTool(store, params) {
  const args = params.arguments || {};
  switch (params.name) {
    case "search":
      return store.search(args);
    case "read":
      return store.read(args.id, { touch: Boolean(args.touch) });
    case "find_related":
      return store.findRelated(args);
    case "build_context_pack":
      return store.buildContextPack(args);
    case "export_nodes_summary":
      return store.exportNodesSummary(args);
    case "list_due_tasks":
      return store.listDueTasks(args);
    case "get_view_link":
      return { ...store.getViewLink(args), ...getViewSecurityInfo() };
    case "read_object_events":
      return store.readObjectEvents(args);
    case "get_rules":
      return store.getRules();
    case "get_rule":
      return store.getRule(args);
    case "get_user_instructions":
      return store.getUserInstructions();
    case "set_user_instructions":
      return store.setUserInstructions(args);
    case "list_kinds":
      return store.listKinds();
    case "list_kind_configs":
      return store.listKindConfigs();
    case "add_kind":
      assertRulesAcknowledged(args);
      return store.addKind(args);
    case "update_kind":
      assertRulesAcknowledged(args);
      return store.updateKind(args);
    case "create_object":
      assertRulesAcknowledged(args);
      return store.createObject(args);
    case "set_title":
      assertRulesAcknowledged(args);
      return store.setTitle(args);
    case "set_kind":
      assertRulesAcknowledged(args);
      return store.setKind(args);
    case "set_summary":
      assertRulesAcknowledged(args);
      return store.setSummary(args);
    case "set_priority":
      assertRulesAcknowledged(args);
      return store.setPriority(args);
    case "set_deadline":
      assertRulesAcknowledged(args);
      return store.setDeadline(args);
    case "set_completed":
      assertRulesAcknowledged(args);
      return store.setCompleted(args);
    case "update_object":
      assertRulesAcknowledged(args);
      return store.updateObject(args);
    case "add_content":
      assertRulesAcknowledged(args);
      return store.addContent(args);
    case "replace_content":
      assertRulesAcknowledged(args);
      return store.replaceContent(args);
    case "remove_content":
      assertRulesAcknowledged(args);
      return store.removeContent(args);
    case "create_relation":
      assertRulesAcknowledged(args);
      return store.createRelation(args);
    case "update_relation":
      assertRulesAcknowledged(args);
      return store.updateRelation(args);
    case "delete_relation":
      assertRulesAcknowledged(args);
      return store.deleteRelation(args);
    case "delete_object":
      assertRulesAcknowledged(args);
      return store.deleteObject(args);
    case "delete_object_cascade":
      assertRulesAcknowledged(args);
      return store.deleteObjectCascade(args);
    case "archive_object":
      assertRulesAcknowledged(args);
      return store.archiveObject(args);
    default:
      throw new McpError(`Unknown tool: ${params.name}`, -32602);
  }
}

function assertRulesAcknowledged(args) {
  if (args.rules_acknowledged !== true) {
    throw new McpError("Call get_rules before mutating memory. Mutating memory requires rules_acknowledged: true after considering the applicable AI Second Brain guidance.", -32602);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isSseLimitEnabled() {
  return truthyEnv(process.env.BRAIN_MCP_SSE_LIMIT_ENABLED || process.env.MCP_SSE_LIMIT_ENABLED);
}

function truthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function acceptPassiveSse(request, response, sessions) {
  const sessionId = mcpSessionId(request);
  const clientKey = clientSessionKey(request, sessionId);
  const session = sessions.get(clientKey);
  const now = Date.now();

  if (!session) {
    rejectPassiveSse(response, ensureDormantSession(sessions, request, sessionId, now), sessionId, clientKey, now);
    return;
  }

  if (session?.sleepUntil && session.sleepUntil > now) {
    rejectPassiveSse(response, session, sessionId, clientKey, now);
    return;
  }

  if (session?.response && !session.response.destroyed) {
    session.response.end();
  }

  const activeSession = ensureSession(sessions, request, sessionId);
  activeSession.response = response;
  activeSession.sleepUntil = null;
  activeSession.streamOpenedAt = now;
  console.info(`mcp passive_sse_accepted session=${sessionId || "none"} client=${clientKey}`);
  sendSseAccepted(response, () => {
    if (activeSession.response === response) {
      activeSession.response = null;
    }
  });
}

function rejectPassiveSse(response, session, sessionId, clientKey, now) {
  response.writeHead(204, {
    "cache-control": "no-store",
    "retry-after": String(Math.ceil((session.sleepUntil - now) / 1000))
  });
  response.end();
  console.info(`mcp passive_sse_rejected session=${sessionId || "none"} client=${clientKey}`);
}

function sendSseAccepted(response, onClose) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  response.on?.("close", onClose);
  response.write(": ai-second-brain-mcp ready\n\n");
  response.end();
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isJsonRpcRequest(message) {
  return message && message.jsonrpc === "2.0" && "id" in message && typeof message.method === "string";
}

function isJsonRpcMessage(message) {
  return message && message.jsonrpc === "2.0" && typeof message.method === "string";
}

function recordActivity(sessions, request, sessionId) {
  const session = ensureSession(sessions, request, sessionId);
  session.lastActivityAt = Date.now();
  session.sleepUntil = null;
  console.info(`mcp activity session=${sessionId || "none"} client=${session.clientKey}`);
  pruneClientSessions(sessions, session.clientKey);
}

function ensureSession(sessions, request, sessionId) {
  const clientKey = clientSessionKey(request, sessionId);
  const existing = sessions.get(clientKey);
  if (existing) return existing;

  const session = {
    clientKey,
    sessionId,
    lastActivityAt: Date.now(),
    sleepUntil: null,
    response: null,
    streamOpenedAt: null
  };
  sessions.set(clientKey, session);
  return session;
}

function ensureDormantSession(sessions, request, sessionId, now) {
  const session = ensureSession(sessions, request, sessionId);
  session.lastActivityAt = now - IDLE_TIMEOUT_MS;
  session.sleepUntil = now + RECONNECT_COOLDOWN_MS;
  return session;
}

function closeIdleSessions(sessions) {
  const now = Date.now();
  for (const [clientKey, session] of sessions) {
    const idleFor = now - session.lastActivityAt;
    if (session.sleepUntil && session.sleepUntil <= now && idleFor >= SESSION_TTL_MS) {
      sessions.delete(clientKey);
      console.info(`mcp session_expired session=${session.sessionId || "none"} client=${clientKey}`);
      continue;
    }
    if (session.sleepUntil || idleFor < IDLE_TIMEOUT_MS) continue;

    if (session.response && !session.response.destroyed) {
      session.response.end();
    }
    session.response = null;
    session.sleepUntil = now + RECONNECT_COOLDOWN_MS;
    console.info(`mcp session_dormant session=${session.sessionId || "none"} client=${clientKey}`);
  }
}

function pruneClientSessions(sessions, clientKey) {
  const clientPrefix = `${clientKey.split(":")[0]}:`;
  const clientSessions = [...sessions.entries()]
    .filter(([, session]) => session.clientKey.startsWith(clientPrefix))
    .sort(([, left], [, right]) => left.lastActivityAt - right.lastActivityAt);

  while (clientSessions.length > MAX_SESSIONS_PER_CLIENT) {
    const [staleKey, staleSession] = clientSessions.shift();
    if (staleSession.response && !staleSession.response.destroyed) {
      staleSession.response.end();
    }
    sessions.delete(staleKey);
    console.info(`mcp session_pruned session=${staleSession.sessionId || "none"} client=${staleKey}`);
  }
}

function clientSessionKey(request, sessionId) {
  const clientId = authClientId(request) || forwardedClientId(request) || "anonymous";
  return `${clientId}:${sessionId || "no-session"}`;
}

function authClientId(request) {
  const authorization = request.headers.authorization || "";
  const secret = request.headers["x-brain-mcp-secret"] || "";
  const params = request.url ? new URL(request.url, "http://localhost").searchParams : new URLSearchParams();
  const urlSecret = params.get("key") || params.get("secret") || "";
  const raw = authorization || secret || urlSecret;
  return raw ? `auth-${sha256(raw)}` : "";
}

function forwardedClientId(request) {
  const forwardedFor = request.headers["x-forwarded-for"] || "";
  const clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(",")[0];
  const userAgent = request.headers["user-agent"] || "";
  const raw = `${clientIp.trim()} ${userAgent}`.trim();
  return raw ? `client-${sha256(raw)}` : "";
}

function mcpSessionId(request) {
  const value = request.headers["mcp-session-id"];
  return Array.isArray(value) ? value[0] : value || "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function withMutationRequirement(description) {
  return description;
}

function objectIdSchema(description = "Object id.") {
  return { type: "string", pattern: "^obj_[a-z0-9_]+$", description };
}

function rulesAcknowledgedSchema() {
  return {
    type: "boolean",
    description: "Set true when the applicable AI Second Brain guidance has been considered."
  };
}

function kindColorSchema() {
  return {
    type: "object",
    description: "Visual color configuration for graph nodes and kind tags.",
    properties: {
      fill: { type: "string", description: "Fill color as #rrggbb or hsl(...)." },
      stroke: { type: "string", description: "Stroke color as #rrggbb or hsl(...)." }
    },
    required: ["fill", "stroke"]
  };
}

function contentSchema() {
  return {
    type: "array",
    description: "Durable content lines. Keep each line stable, useful and scoped to this object.",
    items: { type: "string" }
  };
}

function relationsSchema() {
  return {
    type: "array",
    description: "Outgoing untyped relations to add. Existing duplicate direct or reverse links are skipped with warnings.",
    items: {
      type: "object",
      properties: {
        to: objectIdSchema("Target object id."),
        importance: { type: "number", exclusiveMinimum: 0, maximum: 1, description: "Optional link strength; defaults to 0.5." }
      },
      required: ["to"],
      additionalProperties: false
    }
  };
}

function setCors(request, response) {
  const allowed = allowedOrigins();
  const origin = request.headers.origin;
  if (origin && (allowed.includes("*") || allowed.includes(origin))) {
    response.setHeader("access-control-allow-origin", origin);
  }
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "content-type, accept, authorization, x-brain-mcp-secret, mcp-protocol-version, mcp-session-id"
  );
  response.setHeader("access-control-expose-headers", "mcp-session-id");
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  const allowed = allowedOrigins();
  return !origin || allowed.includes("*") || allowed.includes(origin);
}

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
