import assert from "node:assert/strict";
import test from "node:test";
import { BrainStore } from "../src/brain-store.js";
import { dispatch, TOOLS } from "../src/mcp-handler.js";

async function createTestObject(store, object) {
  return store.createObject({
    id: object.id,
    kind: object.kind,
    title: object.title,
    summary: object.summary,
    priority: object.priority,
    content: object.content,
    deadline_at: object.deadline_at ?? object.dates?.deadline_at,
    completed_at: object.completed_at ?? object.dates?.completed_at
  });
}

test("tools/list exposes the MCP API", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  });

  assert.deepEqual(
    new Set(response.result.tools.map((item) => item.name)),
    new Set([
      "search",
      "read",
      "find_related",
      "build_context_pack",
      "export_nodes_summary",
      "list_due_tasks",
      "get_view_link",
      "read_object_events",
      "get_rules",
      "get_rule",
      "get_user_instructions",
      "set_user_instructions",
      "list_kinds",
      "list_kind_configs",
      "add_kind",
      "update_kind",
      "create_object",
      "set_title",
      "set_kind",
      "set_summary",
      "set_priority",
      "set_deadline",
      "set_completed",
      "update_object",
      "add_content",
      "replace_content",
      "remove_content",
      "create_relation",
      "update_relation",
      "delete_relation",
      "delete_object",
      "delete_object_cascade",
      "archive_object"
    ])
  );
  assert.equal(TOOLS.length, 33);
  assert.equal(TOOLS.some((item) => item.name === "write_history"), false);
});

test("search tool accepts exploratory query lists", async () => {
  const searchTool = TOOLS.find((item) => item.name === "search");

  assert.match(searchTool.description, /before creating or linking/);
  assert.equal(searchTool.inputSchema.required, undefined);
  assert.equal(searchTool.inputSchema.properties.queries.type, "array");
  assert.equal(searchTool.inputSchema.properties.queries.items.type, "string");
  assert.match(searchTool.inputSchema.properties.queries.description, /anti-duplicate/);
});

test("rules tools separate strategic files from technical tool descriptions", async () => {
  const rulesTool = TOOLS.find((item) => item.name === "get_rules");
  const ruleTool = TOOLS.find((item) => item.name === "get_rule");
  const userInstructionsTool = TOOLS.find((item) => item.name === "set_user_instructions");

  assert.match(rulesTool.description, /strategic rules entry point/);
  assert.match(rulesTool.description, /user_instructions\.md/);
  assert.match(rulesTool.description, /priority/);
  assert.match(rulesTool.description, /MCP schemas and descriptions/);
  assert.match(ruleTool.description, /targeted lookup/);
  assert.match(userInstructionsTool.description, /personal preferences/);
  assert.equal(userInstructionsTool.inputSchema.properties.content.maxLength, 32768);
  assert.deepEqual(ruleTool.inputSchema.properties.name.enum, [
    "README.md",
    "editing_rules.md",
    "empty_brain.md",
    "kind.md",
    "relations.md",
    "memory_policy.md"
  ]);
});

test("create_relation tool exposes untyped links", async () => {
  const relationTool = TOOLS.find((item) => item.name === "create_relation");

  assert.match(relationTool.description, /untyped weighted link/);
  assert.equal(relationTool.inputSchema.properties.type, undefined);
  assert.equal(relationTool.inputSchema.properties.importance.type, "number");
  assert.equal(relationTool.inputSchema.properties.importance.exclusiveMinimum, 0);
  assert.equal(relationTool.inputSchema.properties.importance.maximum, 1);
  assert.deepEqual(relationTool.inputSchema.required, [
    "from_id",
    "to_id",
    "rules_acknowledged"
  ]);
  assert.equal(relationTool.inputSchema.additionalProperties, false);
});

test("create_object, set_priority and update_object tools expose precise object mutations", async () => {
  const createTool = TOOLS.find((item) => item.name === "create_object");
  const priorityTool = TOOLS.find((item) => item.name === "set_priority");
  const updateObjectTool = TOOLS.find((item) => item.name === "update_object");

  assert.match(createTool.description, /never merges automatically/);
  assert.equal(createTool.inputSchema.properties.deadline_at.type, "string");
  assert.match(createTool.inputSchema.properties.by.description, /Codex, ChatGPT, Claude, Claude Code, Cursor, Gemini, Grok, Perplexity, Mistral or GLM/);
  assert.match(createTool.inputSchema.properties.by.description, /do not use the human user's name/);
  assert.equal(createTool.inputSchema.properties.priority.maximum, 1);
  assert.equal(createTool.inputSchema.properties.relations.type, "array");
  assert.deepEqual(createTool.inputSchema.properties.relations.items.required, ["to"]);
  assert.equal(createTool.inputSchema.properties.relations.items.properties.type, undefined);
  assert.equal(createTool.inputSchema.properties.relations.items.properties.importance.type, "number");
  assert.deepEqual(createTool.inputSchema.required, ["title", "rules_acknowledged"]);
  assert.deepEqual(priorityTool.inputSchema.required, ["id", "priority", "rules_acknowledged"]);
  assert.equal(priorityTool.inputSchema.properties.priority.minimum, 0);
  assert.deepEqual(updateObjectTool.inputSchema.required, ["id", "rules_acknowledged"]);
  assert.equal(updateObjectTool.inputSchema.properties.content, undefined);
  assert.equal(updateObjectTool.inputSchema.properties.relations.type, "array");
  assert.equal(updateObjectTool.inputSchema.properties.priority.maximum, 1);
});

test("update_relation and delete_relation tools are explicit relation mutations", async () => {
  const updateTool = TOOLS.find((item) => item.name === "update_relation");
  const deleteTool = TOOLS.find((item) => item.name === "delete_relation");

  assert.equal(updateTool.inputSchema.properties.new_to_id.type, "string");
  assert.equal(updateTool.inputSchema.properties.new_type, undefined);
  assert.equal(updateTool.inputSchema.properties.importance.exclusiveMinimum, 0);
  assert.deepEqual(updateTool.inputSchema.required, [
    "from_id",
    "to_id",
    "rules_acknowledged"
  ]);
  assert.equal(updateTool.inputSchema.additionalProperties, false);
  assert.equal(deleteTool.inputSchema.properties.reason.type, "string");
  assert.deepEqual(deleteTool.inputSchema.required, [
    "from_id",
    "to_id",
    "rules_acknowledged"
  ]);
  assert.equal(deleteTool.inputSchema.additionalProperties, false);
});

test("tools/call returns JSON text content", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "get_rules", arguments: {} }
  });

  const rules = JSON.parse(response.result.content[0].text);
  assert.deepEqual(Object.keys(rules), ["README.md", "user_instructions.md"]);
  assert.match(rules["README.md"], /Read this rules entry point/);
  assert.equal(rules["user_instructions.md"], "");
});

test("user instructions can be read and replaced through MCP", async () => {
  const store = new BrainStore(new MemoryAdapter());
  const write = await dispatch(store, {
    jsonrpc: "2.0",
    id: 26,
    method: "tools/call",
    params: {
      name: "set_user_instructions",
      arguments: { content: "# Preferences\n\nPrefer concise updates.\n" }
    }
  });

  const written = JSON.parse(write.result.content[0].text);
  assert.equal(written["user_instructions.md"], "# Preferences\n\nPrefer concise updates.\n");
  assert.equal(written.max_bytes, 32768);

  const read = await dispatch(store, {
    jsonrpc: "2.0",
    id: 27,
    method: "tools/call",
    params: { name: "get_user_instructions", arguments: {} }
  });

  const instructions = JSON.parse(read.result.content[0].text);
  assert.equal(instructions["user_instructions.md"], "# Preferences\n\nPrefer concise updates.\n");
  assert.equal(instructions.bytes, Buffer.byteLength("# Preferences\n\nPrefer concise updates.\n", "utf8"));
});

test("get_rule returns one specific rule file", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "get_rule", arguments: { name: "memory_policy.md" } }
  });

  const rule = JSON.parse(response.result.content[0].text);
  assert.deepEqual(Object.keys(rule), ["memory_policy.md"]);
  assert.match(rule["memory_policy.md"], /Store durable user-specific context/);
});

test("get_rule returns empty brain onboarding guidance", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "get_rule", arguments: { name: "empty_brain.md" } }
  });

  const rule = JSON.parse(response.result.content[0].text);
  assert.deepEqual(Object.keys(rule), ["empty_brain.md"]);
  assert.match(rule["empty_brain.md"], /active projects/);
  assert.match(rule["empty_brain.md"], /Do not create generic starter nodes/);
});

test("export_nodes_summary tool returns compact nodes without content", async () => {
  const store = new BrainStore(new MemoryAdapter());
  await createTestObject(store, {
    title: "Project Alpha",
    summary: "Contexte utile.",
    content: ["Detail interne a ne pas exporter."]
  });

  const response = await dispatch(store, {
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "export_nodes_summary", arguments: {} }
  });

  const exportData = JSON.parse(response.result.content[0].text);
  assert.equal(exportData.object_count, 1);
  assert.equal(exportData.nodes[0].id, "obj_project_alpha");
  assert.equal("content" in exportData.nodes[0], false);
});

test("list_due_tasks tool returns tasks ordered for action", async () => {
  const store = new BrainStore(new MemoryAdapter());
  await createTestObject(store, {
    title: "Urgent task",
    kind: "task",
    dates: { deadline_at: "2026-07-10T00:00:00.000Z" },
    priority: 1
  });

  const response = await dispatch(store, {
    jsonrpc: "2.0",
    id: 23,
    method: "tools/call",
    params: { name: "list_due_tasks", arguments: { due_before: "2026-07-11T00:00:00.000Z" } }
  });

  const dueTasks = JSON.parse(response.result.content[0].text);
  assert.equal(dueTasks.task_count, 1);
  assert.equal(dueTasks.tasks[0].id, "obj_urgent_task");
  assert.equal(dueTasks.tasks[0].deadline_at, "2026-07-10T00:00:00.000Z");
  assert.equal(dueTasks.tasks[0].priority, 1);
});

test("read_object_events tool returns automatic events", async () => {
  const store = new BrainStore(new MemoryAdapter());
  const object = await createTestObject(store, {
    title: "Project Alpha",
    summary: "Contexte utile."
  });

  const response = await dispatch(store, {
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: { name: "read_object_events", arguments: { id: object.id } }
  });

  const history = JSON.parse(response.result.content[0].text);
  assert.equal(history.id, object.id);
  assert.deepEqual(history.events.map((event) => event.action), ["create"]);
});

test("get_view_link returns configured direct node links", async () => {
  const previousViewUrl = process.env.BRAIN_VIEW_URL;
  delete process.env.BRAIN_VIEW_URL;
  const store = new BrainStore(new MemoryAdapter(), { view_url: "https://brain.example.com/" });

  try {
    const response = await dispatch(store, {
      jsonrpc: "2.0",
      id: 24,
      method: "tools/call",
      params: { name: "get_view_link", arguments: { id: "obj_brain_mcp" } }
    });

    const link = JSON.parse(response.result.content[0].text);
    assert.equal(link.base_url, "https://brain.example.com");
    assert.equal(link.url, "https://brain.example.com#node=obj_brain_mcp");
    assert.equal(link.node_id, "obj_brain_mcp");
  } finally {
    if (previousViewUrl === undefined) {
      delete process.env.BRAIN_VIEW_URL;
    } else {
      process.env.BRAIN_VIEW_URL = previousViewUrl;
    }
  }
});

test("create_object includes direct view link when configured", async () => {
  const previousViewUrl = process.env.BRAIN_VIEW_URL;
  delete process.env.BRAIN_VIEW_URL;
  const store = new BrainStore(new MemoryAdapter(), { view_url: "https://brain.example.com/" });

  try {
    const response = await dispatch(store, {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: {
        name: "create_object",
        arguments: {
          title: "AI Second Brain Project",
          rules_acknowledged: true
        }
      }
    });

    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.id, "obj_ai_second_brain_project");
    assert.equal(result.view_link.url, "https://brain.example.com#node=obj_ai_second_brain_project");
  } finally {
    if (previousViewUrl === undefined) {
      delete process.env.BRAIN_VIEW_URL;
    } else {
      process.env.BRAIN_VIEW_URL = previousViewUrl;
    }
  }
});

test("initialize tells agents to read rules before mutations", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 3,
    method: "initialize"
  });

  assert.match(response.result.instructions, /Call get_rules before any memory mutation/);
  assert.match(response.result.instructions, /rules_acknowledged: true/);
});

test("mutating tools require rules acknowledgement", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "create_object",
      arguments: {
        title: "Decision durable"
      }
    }
  });

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /Call get_rules before mutating memory/);
});

test("mutating tools accept explicit rules acknowledgement", async () => {
  const response = await dispatch(new BrainStore(new MemoryAdapter()), {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "create_object",
      arguments: {
        title: "Decision durable",
        rules_acknowledged: true
      }
    }
  });

  const object = JSON.parse(response.result.content[0].text);
  assert.equal(object.id, "obj_decision_durable");
});

test("delete_object tool removes isolated objects after acknowledgement", async () => {
  const store = new BrainStore(new MemoryAdapter());
  const object = await createTestObject(store, { title: "Temporary node" });

  const response = await dispatch(store, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "delete_object",
      arguments: {
        id: object.id,
        reason: "Cree par erreur.",
        rules_acknowledged: true
      }
    }
  });

  assert.deepEqual(JSON.parse(response.result.content[0].text), {
    id: object.id,
    deleted: true
  });
  assert.equal(await store.adapter.getObject(object.id), null);
});

test("delete_object_cascade tool removes objects after cleaning relations", async () => {
  const store = new BrainStore(new MemoryAdapter());
  const source = await createTestObject(store, { title: "Source project" });
  const object = await createTestObject(store, { title: "Temporary node" });
  await store.createRelation({ from_id: source.id, to_id: object.id });

  const response = await dispatch(store, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "delete_object_cascade",
      arguments: {
        id: object.id,
        reason: "Cree par erreur avec une relation.",
        rules_acknowledged: true
      }
    }
  });

  const deleted = JSON.parse(response.result.content[0].text);
  assert.equal(deleted.id, object.id);
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.removed_relations.length, 1);
  assert.equal(await store.adapter.getObject(object.id), null);
  assert.deepEqual((await store.read(source.id)).relations, []);
});

test("archive_object tool marks objects archived after acknowledgement", async () => {
  const store = new BrainStore(new MemoryAdapter());
  const result = await createTestObject(store, { title: "Temporary node" });

  const response = await dispatch(store, {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: {
      name: "archive_object",
      arguments: {
        id: result.id,
        reason: "Cree par erreur.",
        rules_acknowledged: true
      }
    }
  });

  const archived = JSON.parse(response.result.content[0].text);
  assert.equal(archived.id, result.id);
  assert.equal(archived.archived, true);
  assert.match(archived.archived_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await store.search({ query: "temporaire" })).length, 0);
  assert.equal((await store.search({ query: "temporary", include_archived: true })).length, 1);
});

class MemoryAdapter {
  constructor() {
    this.objects = new Map();
    this.events = new Map();
  }
  async listObjects() {
    return [...this.objects.values()];
  }
  async getObject(id) {
    return this.objects.get(id) || null;
  }
  async putObject(object) {
    this.objects.set(object.id, structuredClone(object));
  }
  async deleteObject(id) {
    this.objects.delete(id);
  }
  async appendObjectEvent(id, event) {
    const events = this.events.get(id) || [];
    events.push(structuredClone(event));
    this.events.set(id, events);
  }
  async listObjectEvents(id) {
    return this.events.get(id) || [];
  }
  async getRules() {
    return {};
  }
  async getUserInstructions() {
    return this.userInstructions || "";
  }
  async setUserInstructions(content) {
    this.userInstructions = content;
  }
  async addKind() {}
}
