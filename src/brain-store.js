import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const OBJECT_SCHEMA = require("../schemas/object.schema.json");

const DEFAULT_CONFIG = {
  objects_dir: "objects",
  events_dir: "events",
  rules_dir: "rules",
  default_context_limit: 5,
  view_url: ""
};

const RULES_ENTRYPOINT = "README.md";
const USER_INSTRUCTIONS_FILE = "user_instructions.md";
const MAX_USER_INSTRUCTIONS_BYTES = 32 * 1024;
const RULE_FILES = new Set([
  RULES_ENTRYPOINT,
  "editing_rules.md",
  "kind.md",
  "relations.md",
  "memory_policy.md"
]);

const KIND_COLOR_PALETTE = [
  { fill: "hsl(205 82% 88%)", stroke: "hsl(205 72% 35%)" },
  { fill: "hsl(32 90% 86%)", stroke: "hsl(28 78% 36%)" },
  { fill: "hsl(145 60% 86%)", stroke: "hsl(150 62% 30%)" },
  { fill: "hsl(276 68% 89%)", stroke: "hsl(274 58% 40%)" },
  { fill: "hsl(354 78% 89%)", stroke: "hsl(350 66% 40%)" },
  { fill: "hsl(178 62% 86%)", stroke: "hsl(184 70% 30%)" },
  { fill: "hsl(52 90% 84%)", stroke: "hsl(45 82% 34%)" },
  { fill: "hsl(230 78% 90%)", stroke: "hsl(232 58% 42%)" },
  { fill: "hsl(115 54% 86%)", stroke: "hsl(120 54% 31%)" },
  { fill: "hsl(318 70% 89%)", stroke: "hsl(320 62% 39%)" },
  { fill: "hsl(18 86% 88%)", stroke: "hsl(14 72% 38%)" },
  { fill: "hsl(258 66% 90%)", stroke: "hsl(255 54% 42%)" }
];

const DEFAULT_KIND_NAMES = [
  "project",
  "task",
  "idea",
  "decision",
  "routine",
  "preference",
  "resource",
  "person",
  "organization",
  "watch_topic",
  "event"
];

const DEFAULT_EDITING_RULES = [
  "# Editing Rules",
  "",
  "These rules describe how to enrich and maintain memory. They complement",
  "the tool descriptions, which already explain tool usage and parameters.",
  "",
  "## Goal",
  "",
  "Memory represents durable information, organized as objects connected by",
  "relations.",
  "",
  "Every mutation should improve this memory without losing information,",
  "creating duplicates, or making the graph unnecessarily complex.",
  "",
  "## Preserve Memory",
  "",
  "Search existing objects before any mutation.",
  "",
  "When several phrasings are plausible, run exploratory searches to reduce",
  "duplicates.",
  "",
  "If an object already exists, enrich it when the meaning remains the same",
  "instead of creating a new object.",
  "",
  "Before any change that may replace or remove information, read the object",
  "again so its content is preserved.",
  "",
  "Prefer archiving when information should disappear from the current context",
  "but still has historical value.",
  "",
  "## Create New Objects",
  "",
  "Information deserves a dedicated object when it has its own identity and can",
  "reasonably be found independently in the future.",
  "",
  "Conversely, a one-off or purely contextual detail should usually be added to",
  "an existing object's content.",
  "",
  "Finding an existing object does not always mean no creation is needed.",
  "",
  "The same piece of information can lead to:",
  "",
  "- enriching an existing object;",
  "- creating one or more new durable entities;",
  "- creating new relations between these objects.",
  "",
  "When several durable entities appear in the same information, consider them",
  "independently. They may evolve separately and deserve their own objects.",
  "",
  "Creating a node requires handling its obvious linked nodes in the same pass.",
  "If a new task, project, decision, resource, or other object explicitly",
  "mentions a durable person, organization, concept, resource, event, or",
  "reusable theme, the agent must search for each one, reuse it if it exists,",
  "or create it if it is missing and durable enough to be found independently",
  "later.",
  "",
  "Do not leave an added node isolated when the information itself names",
  "grounded linked entities. For example, a task to order a gift for someone",
  "should search for or create that person, may create a reusable `gift`",
  "concept when useful, and should link the task to those nodes.",
  "",
  "## Organize The Graph",
  "",
  "Relations only represent that a link exists between two objects.",
  "",
  "After an important creation or update, look for relations that naturally",
  "make the graph more coherent.",
  "",
  "An object may remain isolated when that matches its state: new information,",
  "insufficient context, or an uncertain link.",
  "",
  "Avoid isolated objects when a logical link can be established without",
  "inventing information, but do not force a relation just to complete the",
  "graph.",
  "",
  "An object's content describes that object.",
  "",
  "Graph organization information should be represented through relations or",
  "metadata, not through content.",
  "",
  "## Kinds",
  "",
  "Kinds describe the nature of objects.",
  "",
  "Their use and evolution are defined in `kind.md`.",
  "",
  "## Memory Quality",
  "",
  "Keep only durable information or information likely to be useful in the",
  "future.",
  "",
  "Avoid temporary or anecdotal information, and public facts that do not have",
  "specific value for the user.",
  "",
  "Do not invent information to make the graph more complete.",
  "",
  "## General Principle",
  "",
  "With every mutation, try to improve:",
  "",
  "- object quality;",
  "- relation quality;",
  "- the overall organization of memory.",
  "",
  "Memory should be able to keep evolving naturally without requiring major",
  "reorganization.",
  ""
].join("\n");

const DEFAULT_RULES = {
  [RULES_ENTRYPOINT]: "Read this rules entry point before memory mutations. Detailed tool schemas are exposed by the MCP tools. Use list_kinds and list_kind_configs for the kind registry.",
  "editing_rules.md": DEFAULT_EDITING_RULES,
  "kinds.json": defaultKindsConfigText(),
  "kind.md": defaultKindsRule(),
  "relations.md": "Relations are untyped links. Store only { to, importance }. A pair of nodes can have at most one relation, regardless of direction. importance defaults to 0.5 and must be > 0 and <= 1.",
  "memory_policy.md": "Store durable user-specific context. Avoid temporary or general knowledge."
};

export class BrainStore {
  constructor(adapter, config = DEFAULT_CONFIG, options = {}) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.structuralRules = options.structuralRules || null;
  }

  static async create() {
    const root = path.resolve(process.env.BRAIN_ROOT || process.cwd());
    const config = await readConfig(root);
    const structuralRules = await readStructuralRules(path.join(root, config.rules_dir));
    const adapter = hasKvEnv() ? new KvAdapter(process.env) : new FileAdapter(root, config);
    await adapter.initialize?.();
    return new BrainStore(adapter, config, { structuralRules });
  }

  async read(id, { touch = false } = {}) {
    validateId(id);
    const object = normalizeObject(await this.adapter.getObject(id));
    if (!object) {
      throw new McpError(`Unknown object: ${id}`, -32602);
    }
    if (touch && !isArchivedObject(object)) {
      object.dates.last_seen_at = now();
      await this.putObject(object);
    }
    return object;
  }

  async search({ query = "", queries, kind, limit = 10, include_archived: includeArchived = false }) {
    const terms = termsForQueries({ query, queries });
    const objects = normalizeObjects(await this.adapter.listObjects());
    return searchCandidates(filterArchived(objects, includeArchived), { terms, kind, objects })
      .slice(0, limit);
  }

  async getOverview({
    latestLimit = 5,
    activityLimit = 20,
    dueTaskLimit = 8,
    include_archived: includeArchived = false
  } = {}) {
    const allObjects = normalizeObjects(await this.adapter.listObjects());
    const objects = filterArchived(allObjects, includeArchived);
    const allObjectById = new Map(allObjects.map((object) => [object.id, object]));
    const kindConfigs = await this.listKindConfigs();
    const kindConfigByName = new Map(kindConfigs.map((item) => [item.kind, item]));
    const kindCounts = new Map();
    let relationCount = 0;

    for (const object of objects) {
      kindCounts.set(object.kind, (kindCounts.get(object.kind) || 0) + 1);
      relationCount += object.relations?.length || 0;
    }

    const latest = [...objects]
      .sort((a, b) => dateValue(b.dates?.created_at) - dateValue(a.dates?.created_at))
      .slice(0, latestLimit)
      .map((object) => ({
        id: object.id,
        kind: object.kind,
        title: object.title,
        summary: object.summary,
        created_at: object.dates?.created_at || "",
        updated_at: object.dates?.updated_at || ""
      }));

    const overviewEvents = typeof this.adapter.listAllObjectEvents === "function"
      ? await this.adapter.listAllObjectEvents()
      : await this.readEventsForObjects(allObjects);
    const eventAgentsById = eventAgentSummaries(overviewEvents);
    const activity = overviewEvents
      .filter((event) => !isRelationAction(event.action))
      .sort((a, b) => dateValue(b.at) - dateValue(a.at) || String(a.id || "").localeCompare(String(b.id || "")))
      .slice(0, normalizeLimit(activityLimit))
      .map((event) => eventActivitySummary(event, allObjectById));

    const dueTasks = [...objects]
      .filter((object) => object.dates?.deadline_at)
      .map((object) => dueTaskSummary(object, eventAgentsById.get(object.id)))
      .filter((task) => !task.completed_at)
      .sort(
        (a, b) =>
          emptyDatesLast(a.deadline_at, b.deadline_at) ||
          b.priority - a.priority ||
          dateValue(b.updated_at || b.created_at) - dateValue(a.updated_at || a.created_at) ||
          a.title.localeCompare(b.title)
      )
      .slice(0, normalizeLimit(dueTaskLimit));

    const completedNodes = allObjects
      .filter((object) => object.dates?.completed_at && object.dates?.deadline_at)
      .map((object) => completedNodeSummary(object, eventAgentsById.get(object.id)))
      .sort(
        (a, b) =>
          dateValue(b.completed_at) - dateValue(a.completed_at) ||
          dateValue(b.updated_at || b.created_at) - dateValue(a.updated_at || a.created_at) ||
          a.title.localeCompare(b.title)
      )
      .slice(0, normalizeLimit(dueTaskLimit));

    const nodes = [...objects]
      .sort(
        (a, b) =>
          dateValue(b.dates?.updated_at || b.dates?.created_at) -
            dateValue(a.dates?.updated_at || a.dates?.created_at) ||
          a.title.localeCompare(b.title)
      )
      .map((object) => ({
        id: object.id,
        kind: object.kind,
        title: object.title,
        summary: object.summary,
        priority: object.priority,
        content: object.content || [],
        relations: object.relations || [],
        dates: object.dates || {}
      }));

    return {
      objectCount: objects.length,
      relationCount,
      kinds: [...kindCounts.entries()]
        .map(([kind, count]) => ({ kind, count, color: kindConfigByName.get(kind)?.color || generateKindColor(kind, kindConfigs) }))
        .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
      latest,
      activity,
      dueTasks,
      completedNodes,
      nodes
    };
  }

  async readGlobalEvents({ limit = 20, objects } = {}) {
    const eventLimit = normalizeLimit(limit);
    const events = typeof this.adapter.listAllObjectEvents === "function"
      ? await this.adapter.listAllObjectEvents()
      : await this.readEventsForObjects(objects || normalizeObjects(await this.adapter.listObjects()));
    return events
      .filter((event) => !isRelationAction(event.action))
      .sort((a, b) => dateValue(b.at) - dateValue(a.at) || String(a.id || "").localeCompare(String(b.id || "")))
      .slice(0, eventLimit);
  }

  async readEventsForObjects(objects) {
    if (typeof this.adapter.listObjectEvents !== "function") return [];
    const events = [];
    for (const object of objects || []) {
      for (const event of await this.adapter.listObjectEvents(object.id)) {
        events.push({ id: object.id, ...event });
      }
    }
    return events;
  }

  async findRelated({ id, depth = 1 }) {
    validateId(id);
    const objects = normalizeObjects(await this.adapter.listObjects());
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const seen = new Set([id]);
    const queue = [{ id, depth: 0 }];
    const related = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.depth >= depth) continue;
      const source = objectById.get(current.id) || await this.read(current.id);
      const links = [
        ...(source.relations || []).map((relation) => ({ from: current.id, to: relation.to, importance: relation.importance })),
        ...objects
          .filter((object) => object.id !== current.id)
          .flatMap((object) =>
            (object.relations || [])
              .filter((relation) => relation.to === current.id)
              .map((relation) => ({ from: object.id, to: object.id, importance: relation.importance }))
          )
      ];
      for (const link of links) {
        if (seen.has(link.to)) continue;
        const object = objectById.get(link.to) || normalizeObject(await this.adapter.getObject(link.to));
        const item = {
          from: link.from,
          relation: "linked",
          importance: link.importance,
          object: object || { id: link.to, missing: true },
          depth: current.depth + 1
        };
        related.push(item);
        seen.add(link.to);
        if (object) queue.push({ id: link.to, depth: current.depth + 1 });
      }
    }
    return related;
  }

  async buildContextPack({ query, limit }) {
    const results = await this.search({
      query,
      limit: limit || this.config.default_context_limit,
      include_archived: false
    });
    const objects = [];
    for (const result of results) {
      const object = await this.read(result.id, { touch: true });
      objects.push({
        id: object.id,
        kind: object.kind,
        title: object.title,
        summary: object.summary,
        priority: object.priority,
        content: object.content,
        relations: object.relations,
        dates: object.dates
      });
    }
    return { query, objects };
  }

  async exportNodesSummary({ include_archived: includeArchived = false, kind } = {}) {
    const objects = filterArchived(normalizeObjects(await this.adapter.listObjects()), includeArchived)
      .filter((object) => !kind || object.kind === kind);
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const nodes = [...objects]
      .sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id)
      )
      .map((object) => summarizeObject(object, objectById));

    return {
      object_count: nodes.length,
      relation_count: nodes.reduce((sum, object) => sum + object.relation_count, 0),
      nodes
    };
  }

  async listDueTasks({ due_before: dueBefore, include_no_deadline: includeNoDeadline = false, limit = 50 } = {}) {
    const objects = filterArchived(normalizeObjects(await this.adapter.listObjects()), false);
    const normalizedDueBefore = normalizeDateString(dueBefore);
    const cutoff = normalizedDueBefore ? dateValue(normalizedDueBefore, { dateOnlyEndOfDay: true }) : 0;
    const tasks = objects
      .filter((object) => object.kind === "task")
      .map((object) => dueTaskSummary(object))
      .filter((task) => !task.completed_at)
      .filter((task) => {
        if (!task.deadline_at) return includeNoDeadline;
        if (!cutoff) return true;
        const deadline = dateValue(task.deadline_at);
        return deadline > 0 && deadline <= cutoff;
      })
      .sort(
        (a, b) =>
          emptyDatesLast(a.deadline_at, b.deadline_at) ||
          b.priority - a.priority ||
          dateValue(b.updated_at || b.created_at) - dateValue(a.updated_at || a.created_at) ||
          a.title.localeCompare(b.title)
      )
      .slice(0, normalizeLimit(limit));

    return {
      task_count: tasks.length,
      due_before: normalizedDueBefore || "",
      include_no_deadline: Boolean(includeNoDeadline),
      tasks
    };
  }

  async readObjectEvents({ id, limit = 50 }) {
    validateId(id);
    const eventLimit = normalizeLimit(limit);
    const events = typeof this.adapter.listObjectEvents === "function"
      ? await this.adapter.listObjectEvents(id)
      : [];
    return {
      id,
      events: events.slice(-eventLimit)
    };
  }

  async getRules() {
    const rules = this.structuralRules || await this.adapter.getRules();
    return rulesWithUserInstructions(
      rules[RULES_ENTRYPOINT],
      await this.readUserInstructionsText()
    );
  }

  async getRule({ name }) {
    const normalizedName = normalizeRuleName(name);
    if (this.structuralRules) {
      return specificRule(normalizedName, this.structuralRules[normalizedName]);
    }
    if (typeof this.adapter.getRule === "function") {
      return this.adapter.getRule(normalizedName);
    }
    const rules = await this.adapter.getRules();
    return specificRule(normalizedName, rules[normalizedName]);
  }

  async getUserInstructions() {
    return userInstructions(await this.readUserInstructionsText());
  }

  async setUserInstructions({ content }) {
    const normalized = normalizeUserInstructions(content);
    if (typeof this.adapter.setUserInstructions === "function") {
      await this.adapter.setUserInstructions(normalized);
    } else {
      throw new McpError("User instructions are not writable with this storage adapter.", -32000);
    }
    return {
      [USER_INSTRUCTIONS_FILE]: normalized,
      bytes: Buffer.byteLength(normalized, "utf8"),
      max_bytes: MAX_USER_INSTRUCTIONS_BYTES
    };
  }

  async readUserInstructionsText() {
    if (typeof this.adapter.getUserInstructions === "function") {
      return this.adapter.getUserInstructions();
    }
    return "";
  }

  async listKinds() {
    return (await this.listKindConfigs()).map((item) => item.kind);
  }

  async listKindConfigs() {
    if (typeof this.adapter.listKindConfigs === "function") {
      return this.adapter.listKindConfigs();
    }
    const rules = await this.adapter.getRules();
    return parseKindConfigsFromRules(rules);
  }

  getViewLink({ id } = {}) {
    const baseUrl = normalizeViewUrl(process.env.BRAIN_VIEW_URL || this.config.view_url || "");
    if (!baseUrl) {
      throw new McpError("No view URL configured. Set BRAIN_VIEW_URL or config.view_url.", -32602);
    }
    const nodeId = id ? String(id).trim() : "";
    if (nodeId) validateId(nodeId);
    return {
      url: nodeId ? `${baseUrl}#node=${encodeURIComponent(nodeId)}` : baseUrl,
      base_url: baseUrl,
      node_id: nodeId
    };
  }

  getOptionalViewLink({ id } = {}) {
    try {
      return this.getViewLink({ id });
    } catch (error) {
      if (error instanceof McpError && /No view URL configured/.test(error.message)) {
        return null;
      }
      throw error;
    }
  }

  async addKind({ kind, color, by = "agent" }) {
    const normalized = normalizeKind(kind);
    const existingConfigs = await this.listKindConfigs();
    const exists = existingConfigs.some((item) => item.kind === normalized);
    const normalizedColor = color == null ? undefined : normalizeKindColor(color);
    const nextColor = normalizedColor || existingConfigs.find((item) => item.kind === normalized)?.color || generateKindColor(normalized, existingConfigs);
    if (!exists) {
      await this.adapter.addKind(normalized, nextColor);
    }
    return { kind: normalized, color: nextColor, created: !exists, by };
  }

  async updateKind({ kind, color, by = "agent" }) {
    const normalized = normalizeKind(kind);
    const normalizedColor = normalizeKindColor(color);
    const configs = await this.listKindConfigs();
    if (!configs.some((item) => item.kind === normalized)) {
      throw new McpError(`Unknown kind: ${normalized}`, -32602);
    }
    await this.adapter.updateKind(normalized, { color: normalizedColor });
    return { kind: normalized, color: normalizedColor, updated: true, by };
  }

  async createObject({ id, kind, title, summary, priority, content, relations, deadline_at: deadlineAt, completed_at: completedAt, by = "agent" }) {
    if (!title || typeof title !== "string") {
      throw new McpError("title is required", -32602);
    }
    const directRelations = normalizeDirectRelationInputs(relations);
    if (directRelations.length > 0) {
      const objects = normalizeObjects(await this.adapter.listObjects());
      directRelations.forEach((relation) => assertRelationEndpointMutable(objects, relation.to));
    }
    const objectId = id || `obj_${slugify(title)}`;
    validateId(objectId);
    if (await this.adapter.getObject(objectId)) {
      throw new McpError(`Object already exists: ${objectId}`, -32602);
    }
    const object = newObject(objectId, {
      kind,
      title,
      summary,
      priority,
      content,
      relations: [],
      deadline_at: deadlineAt,
      completed_at: completedAt
    }, now());
    await this.putObject(object);
    await this.appendEvent(object.id, {
      by,
      action: "create",
      summary: `Created ${object.title}.`,
      details: { actual_id: object.id, kind: object.kind, title: object.title }
    });
    const relationResult = await this.addDirectRelations({
      id: object.id,
      relations: directRelations,
      by
    });
    const created = relationResult.object || object;
    return {
      ...created,
      view_link: this.getOptionalViewLink({ id: created.id }),
      object: created,
      warnings: relationResult.warnings
    };
  }

  async setTitle({ id, title, by = "agent" }) {
    if (!title || typeof title !== "string") throw new McpError("title is required", -32602);
    return this.updateObjectField({ id, field: "title", value: title.trim(), by });
  }

  async setKind({ id, kind, by = "agent" }) {
    return this.updateObjectField({ id, field: "kind", value: normalizeKind(kind), by });
  }

  async setSummary({ id, summary = "", by = "agent" }) {
    return this.updateObjectField({ id, field: "summary", value: String(summary), by });
  }

  async setPriority({ id, priority, by = "agent" }) {
    return this.updateObjectField({ id, field: "priority", value: normalizeNodePriority(priority), by });
  }

  async setDeadline({ id, deadline_at: deadlineAt, by = "agent" }) {
    return this.updateObjectDate({ id, field: "deadline_at", value: normalizeDateString(deadlineAt), by });
  }

  async setCompleted({ id, completed_at: completedAt, by = "agent" }) {
    return this.updateObjectDate({ id, field: "completed_at", value: normalizeDateString(completedAt), by });
  }

  async updateObject({ id, title, kind, summary, priority, relations, deadline_at: deadlineAt, completed_at: completedAt, by = "agent" }) {
    validateId(id);
    const directRelations = normalizeDirectRelationInputs(relations);
    const changes = {};
    if (title != null) {
      if (typeof title !== "string" || title.trim().length === 0) throw new McpError("title must not be empty", -32602);
      changes.title = title.trim();
    }
    if (kind != null) changes.kind = normalizeKind(kind);
    if (summary != null) changes.summary = String(summary);
    if (priority != null) changes.priority = normalizeNodePriority(priority);

    const dateChanges = {};
    if (deadlineAt != null) dateChanges.deadline_at = normalizeDateString(deadlineAt);
    if (completedAt != null) dateChanges.completed_at = normalizeDateString(completedAt);

    if (Object.keys(changes).length === 0 && Object.keys(dateChanges).length === 0 && directRelations.length === 0) {
      throw new McpError("at least one update field is required", -32602);
    }
    if (directRelations.length > 0) {
      const objects = normalizeObjects(await this.adapter.listObjects());
      directRelations.forEach((relation) => assertRelationEndpointMutable(objects, relation.to));
    }

    const object = await this.read(id);
    assertObjectMutable(object);
    const previous = {};
    for (const [field, value] of Object.entries(changes)) {
      previous[field] = object[field];
      object[field] = value;
    }
    object.dates = { ...(object.dates || {}), updated_at: now(), last_seen_at: object.dates?.last_seen_at || "" };
    for (const [field, value] of Object.entries(dateChanges)) {
      previous[field] = object.dates[field] || "";
      if (value) {
        object.dates[field] = value;
      } else {
        delete object.dates[field];
      }
    }
    if (Object.keys(changes).length > 0 || Object.keys(dateChanges).length > 0) {
      await this.putObject(object);
      await this.appendEvent(id, {
        by,
        action: "update",
        summary: `Updated ${Object.keys({ ...changes, ...dateChanges }).join(", ")} for ${object.title}.`,
        details: { previous, next: { ...changes, ...dateChanges } }
      });
    }
    const relationResult = await this.addDirectRelations({ id, relations: directRelations, by });
    const updated = relationResult.object || object;
    return relationResult.warnings.length > 0 ? { ...updated, warnings: relationResult.warnings } : updated;
  }

  async addContent({ id, content, by = "agent" }) {
    const lines = normalizeContentLines(content);
    if (lines.length === 0) throw new McpError("content is required", -32602);
    const object = await this.read(id);
    assertObjectMutable(object);
    object.content = unique([...(object.content || []), ...lines]);
    object.dates.updated_at = now();
    await this.putObject(object);
    await this.appendEvent(id, {
      by,
      action: "update",
      summary: `Added content to ${object.title}.`,
      details: { field: "content", added: lines }
    });
    return object;
  }

  async replaceContent({ id, content, by = "agent" }) {
    const object = await this.read(id);
    assertObjectMutable(object);
    const lines = normalizeContentLines(content);
    object.content = unique(lines);
    object.dates.updated_at = now();
    await this.putObject(object);
    await this.appendEvent(id, {
      by,
      action: "update",
      summary: `Replaced content for ${object.title}.`,
      details: { field: "content", count: object.content.length }
    });
    return object;
  }

  async removeContent({ id, content, by = "agent" }) {
    const lines = new Set(normalizeContentLines(content));
    if (lines.size === 0) throw new McpError("content is required", -32602);
    const object = await this.read(id);
    assertObjectMutable(object);
    object.content = (object.content || []).filter((item) => !lines.has(item));
    object.dates.updated_at = now();
    await this.putObject(object);
    await this.appendEvent(id, {
      by,
      action: "update",
      summary: `Removed content from ${object.title}.`,
      details: { field: "content", removed: [...lines] }
    });
    return object;
  }

  async updateObjectField({ id, field, value, by }) {
    validateId(id);
    const object = await this.read(id);
    assertObjectMutable(object);
    const previous = object[field];
    object[field] = value;
    object.dates.updated_at = now();
    await this.putObject(object);
    await this.appendEvent(id, {
      by,
      action: "update",
      summary: `Updated ${field} for ${object.title}.`,
      details: { field, previous, next: value }
    });
    return object;
  }

  async updateObjectDate({ id, field, value, by }) {
    validateId(id);
    const object = await this.read(id);
    assertObjectMutable(object);
    const previous = object.dates?.[field] || "";
    object.dates = { ...(object.dates || {}), updated_at: now(), last_seen_at: object.dates?.last_seen_at || "" };
    if (value) {
      object.dates[field] = value;
    } else {
      delete object.dates[field];
    }
    await this.putObject(object);
    await this.appendEvent(id, {
      by,
      action: "update",
      summary: `Updated ${field} for ${object.title}.`,
      details: { field, previous, next: value }
    });
    return object;
  }

  async createRelation({ from_id: fromId, to_id: toId, importance, by = "agent" }) {
    validateId(fromId);
    validateId(toId);
    validateDistinctRelationIds(fromId, toId);
    const source = await this.read(fromId);
    assertObjectMutable(source);
    const relation = normalizeRelation({ to: toId, importance });
    const objects = normalizeObjects(await this.adapter.listObjects());
    assertRelationEndpointMutable(objects, toId);
    const pairKey = relationPairKey(fromId, toId);
    const existingRelation = findExistingRelationPair(objects, pairKey);
    if (existingRelation) {
      return {
        ...source,
        status: "already_exists",
        warnings: [
          {
            code: "duplicate_relation",
            message: `Relation already exists between ${fromId} and ${toId}.`,
            from_id: fromId,
            to_id: toId,
            existing_from_id: existingRelation.from_id,
            existing_to_id: existingRelation.to_id
          }
        ]
      };
    }
    source.relations.push(relation);
    source.dates.updated_at = now();
    await this.putObject(source);
    await this.appendEvent(fromId, {
      by,
      action: "relate",
      summary: `Linked ${fromId} to ${toId}.`,
      details: { to: toId, importance: relation.importance }
    });
    return source;
  }

  async addDirectRelations({ id, relations, by = "agent" }) {
    if (!Array.isArray(relations) || relations.length === 0) {
      return { object: null, warnings: [] };
    }
    validateId(id);
    const source = await this.read(id);
    assertObjectMutable(source);
    const warnings = [];
    const added = [];
    const objects = normalizeObjects(await this.adapter.listObjects());
    const seen = new Set((source.relations || []).map((relation) => relationPairKey(id, relation.to)));

    for (const relation of relations) {
      validateDistinctRelationIds(id, relation.to);
      assertRelationEndpointMutable(objects, relation.to);
      const key = relationPairKey(id, relation.to);
      if (seen.has(key) || objects.some((object) => object.id !== id && object.relations.some((item) => relationPairKey(object.id, item.to) === key))) {
        warnings.push({
          code: "duplicate_relation",
          message: `Relation already exists between ${id} and ${relation.to}.`,
          from_id: id,
          to_id: relation.to
        });
        continue;
      }
      seen.add(key);
      source.relations.push(relation);
      added.push(relation);
    }

    if (added.length > 0) {
      source.dates.updated_at = now();
      await this.putObject(source);
      await this.appendEvent(id, {
        by,
        action: "relate",
        summary: `Added ${added.length} direct link${added.length > 1 ? "s" : ""}.`,
        details: { added, warnings }
      });
    }

    return { object: source, warnings };
  }

  async updateRelation({ from_id: fromId, to_id: toId, new_to_id: newToId, importance, by = "agent" }) {
    validateId(fromId);
    validateId(toId);
    if (newToId != null) validateId(newToId);
    if (newToId == null && importance == null) {
      throw new McpError("new_to_id or importance is required", -32602);
    }
    validateDistinctRelationIds(fromId, toId);
    if (newToId != null) validateDistinctRelationIds(fromId, newToId);

    const source = await this.read(fromId);
    assertObjectMutable(source);
    const target = normalizeObject(await this.adapter.getObject(toId));
    assertObjectMutable(target);
    const relation = source.relations.find((item) => item.to === toId);
    const reverseRelation = target?.relations.find((item) => item.to === fromId);
    if (!relation && !reverseRelation) {
      throw new McpError(`Unknown relation between ${fromId} and ${toId}`, -32602);
    }
    assertObjectMutable(relation ? source : target);

    const ownerRelation = relation || reverseRelation;
    const nextRelation = normalizeRelation({
      to: newToId ?? toId,
      importance: importance ?? ownerRelation.importance
    });
    const objects = normalizeObjects(await this.adapter.listObjects());
    assertRelationEndpointMutable(objects, toId);
    if (newToId != null) assertRelationEndpointMutable(objects, newToId);
    const nextKey = relationPairKey(fromId, nextRelation.to);
    const currentKey = relationPairKey(fromId, toId);
    if (newToId != null) {
      const conflict = objects.some((object) =>
        object.relations.some((item) => relationPairKey(object.id, item.to) === nextKey && relationPairKey(object.id, item.to) !== currentKey)
      );
      if (conflict) {
        throw new McpError(`Relation already exists between ${fromId} and ${nextRelation.to}`, -32602);
      }
    }

    const previous = { to: toId, importance: ownerRelation.importance };
    if (relation) {
      relation.to = nextRelation.to;
      relation.importance = nextRelation.importance;
    } else {
      target.relations = target.relations.filter((item) => item !== reverseRelation);
      source.relations.push(nextRelation);
    }
    source.dates.updated_at = now();
    await this.putObject(source);
    if (!relation) {
      target.dates.updated_at = source.dates.updated_at;
      await this.putObject(target);
    }
    await this.appendEvent(fromId, {
      by,
      action: "update_relation",
      summary: `Updated link from ${previous.to} to ${nextRelation.to}.`,
      details: {
        previous,
        next: { to: nextRelation.to, importance: nextRelation.importance }
      }
    });
    return source;
  }

  async deleteRelation({ from_id: fromId, to_id: toId, reason = "", by = "agent" }) {
    validateId(fromId);
    validateId(toId);
    validateDistinctRelationIds(fromId, toId);
    const source = await this.read(fromId);
    assertObjectMutable(source);
    const objects = normalizeObjects(await this.adapter.listObjects());
    assertRelationEndpointMutable(objects, toId);
    let relationIndex = source.relations.findIndex((item) => item.to === toId);
    let owner = source;
    let ownerId = fromId;
    let targetId = toId;
    if (relationIndex === -1) {
      const target = normalizeObject(objects.find((object) => object.id === toId));
      const reverseIndex = target?.relations.findIndex((item) => item.to === fromId) ?? -1;
      if (reverseIndex === -1) {
        throw new McpError(`Unknown relation between ${fromId} and ${toId}`, -32602);
      }
      owner = target;
      ownerId = toId;
      targetId = fromId;
      relationIndex = reverseIndex;
    }
    assertObjectMutable(owner);
    const [relation] = owner.relations.splice(relationIndex, 1);
    owner.dates.updated_at = now();
    await this.putObject(owner);
    await this.appendEvent(ownerId, {
      by,
      action: "delete_relation",
      summary: `Deleted link to ${targetId}.`,
      details: {
        to: relation.to,
        importance: relation.importance,
        reason
      }
    });
    return owner;
  }

  async deleteObject({ id, reason, by = "agent" }) {
    validateId(id);
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new McpError("reason is required", -32602);
    }

    const object = await this.read(id);
    assertObjectMutable(object);
    const { outgoing, incoming } = await this.objectRelationLinks(id, object);

    if (outgoing.length > 0 || incoming.length > 0) {
      const details = [
        ...outgoing.map((relation) => `outgoing:${relation.to}`),
        ...incoming.map((relation) => `incoming:${relation.from}`)
      ].join(", ");
      throw new McpError(`Cannot delete linked object ${id}: ${details}`, -32602);
    }

    await this.appendEvent(id, {
      by,
      action: "delete",
      summary: `Deleted ${object.title}.`,
      details: {
        reason: reason.trim(),
        title: object.title,
        kind: object.kind,
        summary: object.summary || ""
      }
    });
    await this.adapter.deleteObject(id);
    return { id, deleted: true };
  }

  async deleteObjectCascade({ id, reason, by = "agent" }) {
    validateId(id);
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new McpError("reason is required", -32602);
    }

    const object = await this.read(id);
    assertObjectMutable(object);
    const { objects, outgoing, incoming } = await this.objectRelationLinks(id, object);
    for (const link of incoming) {
      assertObjectMutable(link.object);
    }
    for (const relation of outgoing) {
      assertRelationEndpointMutable(objects, relation.to);
    }

    const timestamp = now();
    const removedOutgoing = outgoing.map((relation) => ({ from: id, to: relation.to, importance: relation.importance }));
    const removedIncoming = incoming.map((link) => ({ from: link.from, to: id, importance: link.importance }));

    for (const link of incoming) {
      link.object.relations = (link.object.relations || []).filter((relation) => relation.to !== id);
      link.object.dates = { ...(link.object.dates || {}), updated_at: timestamp, last_seen_at: link.object.dates?.last_seen_at || "" };
      await this.putObject(link.object);
      await this.appendEvent(link.from, {
        by,
        action: "delete_relation",
        summary: `Deleted link to ${id}.`,
        details: {
          to: id,
          importance: link.importance,
          reason: reason.trim(),
          deleted_with_object: id
        }
      });
    }

    await this.appendEvent(id, {
      by,
      action: "delete",
      summary: `Deleted ${object.title} with ${removedOutgoing.length + removedIncoming.length} relation cleanup${removedOutgoing.length + removedIncoming.length > 1 ? "s" : ""}.`,
      details: {
        reason: reason.trim(),
        title: object.title,
        kind: object.kind,
        summary: object.summary || "",
        deleted_relations: [...removedOutgoing, ...removedIncoming]
      }
    });
    await this.adapter.deleteObject(id);

    return {
      id,
      deleted: true,
      removed_relations: [...removedOutgoing, ...removedIncoming],
      affected_objects: incoming.map((link) => link.from)
    };
  }

  async objectRelationLinks(id, object) {
    const objects = normalizeObjects(await this.adapter.listObjects());
    const outgoing = object.relations || [];
    const incoming = objects
      .filter((candidate) => candidate.id !== id)
      .flatMap((candidate) =>
        (candidate.relations || [])
          .filter((relation) => relation.to === id)
          .map((relation) => ({ from: candidate.id, importance: relation.importance, object: candidate }))
      );
    return { objects, outgoing, incoming };
  }

  async archiveObject({ id, reason, by = "agent" }) {
    validateId(id);
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new McpError("reason is required", -32602);
    }

    const object = await this.read(id);
    if (isArchivedObject(object)) {
      return {
        id,
        archived: true,
        archived_at: object.dates.archived_at,
        completed_at: object.dates?.completed_at || "",
        object
      };
    }
    const timestamp = now();
    const archivedAt = object.dates?.archived_at || timestamp;
    const completedAt = object.dates?.completed_at || timestamp;
    const next = {
      ...object,
      dates: {
        ...object.dates,
        updated_at: timestamp,
        archived_at: archivedAt,
        completed_at: completedAt,
        last_seen_at: object.dates?.last_seen_at || ""
      }
    };

    await this.putObject(next);
    await this.appendEvent(id, {
      by,
      action: "archive",
      summary: `Archived ${object.title}.`,
      details: {
        reason: reason.trim(),
        title: object.title,
        kind: object.kind,
        archived_at: archivedAt,
        completed_at: completedAt
      }
    });

    return {
      id,
      archived: true,
      archived_at: archivedAt,
      completed_at: completedAt,
      object: next
    };
  }

  async putObject(object) {
    const normalized = normalizeObject(object);
    validateObject(normalized);
    await this.adapter.putObject(normalized);
  }

  async appendEvent(id, event) {
    if (typeof this.adapter.appendObjectEvent !== "function") return;
    validateId(id);
    await this.adapter.appendObjectEvent(id, normalizeEvent(event));
  }
}

class FileAdapter {
  constructor(root, config) {
    this.root = root;
    this.objectsDir = path.join(root, config.objects_dir);
    this.eventsDir = path.join(root, config.events_dir);
    this.rulesDir = path.join(root, config.rules_dir);
  }

  async initialize() {
    await fs.mkdir(this.objectsDir, { recursive: true });
    await fs.mkdir(this.eventsDir, { recursive: true });
    await fs.mkdir(this.rulesDir, { recursive: true });
    await fs.writeFile(path.join(this.rulesDir, USER_INSTRUCTIONS_FILE), "", { flag: "wx" }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
  }

  async listObjects() {
    const entries = await fs.readdir(this.objectsDir).catch(() => []);
    const objects = [];
    for (const entry of entries.filter((name) => /^obj_[a-z0-9_]+\.json$/.test(name))) {
      objects.push(JSON.parse(await fs.readFile(path.join(this.objectsDir, entry), "utf8")));
    }
    return objects;
  }

  async getObject(id) {
    const file = path.join(this.objectsDir, `${id}.json`);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async putObject(object) {
    validateObject(object);
    await fs.writeFile(
      path.join(this.objectsDir, `${object.id}.json`),
      `${JSON.stringify(object, null, 2)}\n`,
      "utf8"
    );
  }

  async deleteObject(id) {
    await fs.unlink(path.join(this.objectsDir, `${id}.json`)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async appendObjectEvent(id, event) {
    await fs.appendFile(
      path.join(this.eventsDir, `${id}.events.jsonl`),
      `${JSON.stringify(event)}\n`,
      "utf8"
    );
  }

  async listObjectEvents(id) {
    const file = path.join(this.eventsDir, `${id}.events.jsonl`);
    const text = await fs.readFile(file, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async listAllObjectEvents() {
    const entries = await fs.readdir(this.eventsDir).catch(() => []);
    const events = [];
    for (const entry of entries.filter((name) => /^obj_[a-z0-9_]+\.events\.jsonl$/.test(name))) {
      const id = entry.replace(/\.events\.jsonl$/, "");
      const text = await fs.readFile(path.join(this.eventsDir, entry), "utf8");
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        events.push({ id, ...JSON.parse(line) });
      }
    }
    return events;
  }

  async getRules() {
    const entrypoint = await fs.readFile(path.join(this.rulesDir, RULES_ENTRYPOINT), "utf8").catch(() => "");
    return rulesEntrypoint(entrypoint);
  }

  async getRule(name) {
    const content = await fs.readFile(path.join(this.rulesDir, name), "utf8").catch(() => "");
    return specificRule(name, content);
  }

  async getUserInstructions() {
    return fs.readFile(path.join(this.rulesDir, USER_INSTRUCTIONS_FILE), "utf8").catch(() => "");
  }

  async setUserInstructions(content) {
    await fs.writeFile(path.join(this.rulesDir, USER_INSTRUCTIONS_FILE), content, "utf8");
  }

  async listKindConfigs() {
    return this.readKindConfigs();
  }

  async addKind(kind, color) {
    const configs = await this.readKindConfigs();
    if (configs.some((item) => item.kind === kind)) return;
    configs.push({ kind, color: normalizeKindColor(color || generateKindColor(kind, configs)) });
    await this.writeKindConfigs(configs);
  }

  async updateKind(kind, changes) {
    const configs = await this.readKindConfigs();
    const entry = configs.find((item) => item.kind === kind);
    if (!entry) throw new McpError(`Unknown kind: ${kind}`, -32602);
    if (changes.color) entry.color = normalizeKindColor(changes.color);
    await this.writeKindConfigs(configs);
  }

  async readKindConfigs() {
    const jsonFile = path.join(this.rulesDir, "kinds.json");
    const json = await fs.readFile(jsonFile, "utf8").catch(() => "");
    if (json) return parseKindConfigs(json, []);

    const markdown = await fs.readFile(path.join(this.rulesDir, "kind.md"), "utf8").catch(async () => (
      fs.readFile(path.join(this.rulesDir, "kinds.md"), "utf8").catch(() => "")
    ));
    return parseKindConfigs("", parseKinds(markdown || defaultKindsRule()).map((kind) => ({ kind })));
  }

  async writeKindConfigs(configs) {
    await fs.writeFile(path.join(this.rulesDir, "kinds.json"), kindConfigsText(configs), "utf8");
  }
}

class KvAdapter {
  constructor(env) {
    this.url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
    this.token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  }

  async listObjects() {
    const keys = await this.command(["KEYS", "brain:object:*"]);
    const objects = [];
    for (const key of keys) {
      const value = await this.command(["GET", key]);
      if (value) objects.push(JSON.parse(value));
    }
    return objects;
  }

  async getObject(id) {
    const value = await this.command(["GET", `brain:object:${id}`]);
    return value ? JSON.parse(value) : null;
  }

  async putObject(object) {
    validateObject(object);
    await this.command(["SET", `brain:object:${object.id}`, JSON.stringify(object)]);
  }

  async deleteObject(id) {
    await this.command(["DEL", `brain:object:${id}`]);
  }

  async appendObjectEvent(id, event) {
    await this.command(["RPUSH", `brain:event:${id}`, JSON.stringify(event)]);
  }

  async listObjectEvents(id) {
    const items = await this.command(["LRANGE", `brain:event:${id}`, "0", "-1"]);
    return items.map((item) => JSON.parse(item));
  }

  async listAllObjectEvents() {
    const keys = await this.command(["KEYS", "brain:event:*"]);
    const events = [];
    for (const key of keys) {
      const id = key.replace("brain:event:", "");
      const items = await this.command(["LRANGE", key, "0", "-1"]);
      for (const item of items) {
        events.push({ id, ...JSON.parse(item) });
      }
    }
    return events;
  }

  async getRules() {
    return rulesEntrypoint((await this.readStoredRules())[RULES_ENTRYPOINT]);
  }

  async getRule(name) {
    return specificRule(name, (await this.readStoredRules())[name]);
  }

  async getUserInstructions() {
    const value = await this.command(["GET", "brain:user_instructions"]);
    return value || "";
  }

  async setUserInstructions(content) {
    await this.command(["SET", "brain:user_instructions", content]);
  }

  async readStoredRules() {
    const storedRules = await this.command(["GET", "brain:rules"]);
    if (storedRules) return JSON.parse(storedRules);
    return DEFAULT_RULES;
  }

  async addKind(kind, color) {
    const configs = await this.listKindConfigs();
    if (configs.some((item) => item.kind === kind)) return;
    configs.push({ kind, color: normalizeKindColor(color || generateKindColor(kind, configs)) });
    await this.writeKindConfigs(configs);
  }

  async listKindConfigs() {
    return parseKindConfigsFromRules(await this.readStoredRules());
  }

  async updateKind(kind, changes) {
    const configs = await this.listKindConfigs();
    const entry = configs.find((item) => item.kind === kind);
    if (!entry) throw new McpError(`Unknown kind: ${kind}`, -32602);
    if (changes.color) entry.color = normalizeKindColor(changes.color);
    await this.writeKindConfigs(configs);
  }

  async writeKindConfigs(configs) {
    const rules = await this.readStoredRules();
    rules["kinds.json"] = kindConfigsText(configs);
    delete rules["kinds.md"];
    await this.command(["SET", "brain:rules", JSON.stringify(rules)]);
  }

  async command(body) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new McpError(`KV command failed: HTTP ${response.status}`, -32000);
    }
    const payload = await response.json();
    if (payload.error) {
      throw new McpError(`KV command failed: ${payload.error}`, -32000);
    }
    return payload.result;
  }
}

export class McpError extends Error {
  constructor(message, code = -32000) {
    super(message);
    this.code = code;
  }
}

async function readConfig(root) {
  try {
    const text = await fs.readFile(path.join(root, "config.json"), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(text) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function readStructuralRules(rulesDir) {
  const entries = await Promise.all(
    [...RULE_FILES].map(async (name) => [
      name,
      await fs.readFile(path.join(rulesDir, name), "utf8").catch(() => DEFAULT_RULES[name] || "")
    ])
  );
  return Object.fromEntries(entries);
}

function hasKvEnv() {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function newObject(id, input, timestamp) {
  const deadlineAt = inputDeadline(input);
  const completedAt = inputCompleted(input);
  const dates = {
    created_at: timestamp,
    updated_at: timestamp,
    last_seen_at: ""
  };
  if (deadlineAt !== undefined) dates.deadline_at = deadlineAt;
  if (completedAt !== undefined) dates.completed_at = completedAt;

  return {
    id,
    kind: input.kind || "idea",
    title: input.title.trim(),
    summary: input.summary || "",
    priority: normalizeNodePriority(input.priority),
    content: Array.isArray(input.content) ? input.content : [],
    relations: normalizeRelations(input.relations),
    dates
  };
}

function searchCandidates(objects, { terms, kind, matchAllTerms = false, objects: allObjects = objects }) {
  const objectById = new Map(allObjects.map((object) => [object.id, object]));
  return objects
    .filter((object) => !kind || object.kind === kind)
    .map((object) => ({ object, score: searchScore(terms, object, objectById, { matchAllTerms }) }))
    .filter((candidate) => candidate.score > 0 || terms.size === 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        dateValue(b.object.dates?.updated_at || b.object.dates?.created_at) -
          dateValue(a.object.dates?.updated_at || a.object.dates?.created_at) ||
        a.object.title.localeCompare(b.object.title)
    )
    .map((candidate) => candidate.object);
}

function filterArchived(objects, includeArchived = false) {
  return includeArchived ? objects : objects.filter((object) => !object.dates?.archived_at);
}

function searchScore(terms, object, objectById, { matchAllTerms = false } = {}) {
  if (terms.size === 0) return true;
  const buckets = searchableBuckets(object, objectById);
  const matched = [];
  for (const term of terms) {
    const score = scoreTerm(term, buckets);
    if (score > 0) matched.push(score);
  }
  if (matchAllTerms && matched.length !== terms.size) return 0;
  return matched.reduce((sum, score) => sum + score, 0);
}

function scoreTerm(term, buckets) {
  if (buckets.id.has(term)) return 8;
  if (buckets.title.has(term)) return 7;
  if (buckets.kind.has(term)) return 6;
  if (buckets.summary.has(term)) return 5;
  if (buckets.relations.has(term)) return 4;
  if (buckets.content.has(term)) return 3;
  if (buckets.all.some((word) => word.includes(term))) return 1;
  return 0;
}

function searchableBuckets(object, objectById) {
  const relations = [];
  for (const relation of object.relations || []) {
    const target = objectById.get(relation.to);
    if (target && !target.dates?.archived_at) {
      relations.push(target.id, target.kind, target.title, target.summary);
    } else if (!target) {
      relations.push(relation.to);
    }
  }

  const buckets = {
    id: wordsFor(object.id),
    kind: wordsFor(object.kind),
    title: wordsFor(object.title),
    summary: wordsFor(object.summary),
    content: wordsFor((object.content || []).join(" ")),
    relations: wordsFor(relations.join(" "))
  };

  return {
    ...buckets,
    all: [
      ...buckets.id,
      ...buckets.kind,
      ...buckets.title,
      ...buckets.summary,
      ...buckets.content,
      ...buckets.relations
    ]
  };
}

function matchesTerms(terms, object, { matchAllTerms = false } = {}) {
  if (terms.size === 0) return true;
  const text = [
    object.id,
    object.kind,
    object.title,
    object.summary,
    ...(object.content || [])
  ]
    .join(" ");
  const words = wordsFor(text);
  const matcher = (term) => words.has(term);
  return matchAllTerms ? [...terms].every(matcher) : [...terms].some(matcher);
}

function termsFor(query) {
  return wordsFor(query);
}

function termsForQueries({ query = "", queries }) {
  const values = [];
  if (Array.isArray(queries)) values.push(...queries);
  if (query) values.push(query);
  return termsFor(values.join(" "));
}

function parseKinds(markdown) {
  return [
    ...new Set(
      String(markdown)
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*-\s+`?([a-z][a-z0-9_]*)`?\s*$/)?.[1])
        .filter(Boolean)
    )
  ];
}

function parseKindConfigsFromRules(rules) {
  if (rules["kinds.json"]) {
    return parseKindConfigs(rules["kinds.json"], []);
  }
  return parseKindConfigs("", parseKinds(rules["kind.md"] || rules["kinds.md"] || defaultKindsRule()).map((kind) => ({ kind })));
}

function rulesEntrypoint(content) {
  return {
    [RULES_ENTRYPOINT]: String(content || DEFAULT_RULES[RULES_ENTRYPOINT])
  };
}

function rulesWithUserInstructions(entrypoint, customInstructions) {
  return {
    ...rulesEntrypoint(entrypoint),
    [USER_INSTRUCTIONS_FILE]: String(customInstructions || "")
  };
}

function specificRule(name, content) {
  return {
    [name]: String(content || DEFAULT_RULES[name] || "")
  };
}

function userInstructions(content) {
  const text = String(content || "");
  return {
    [USER_INSTRUCTIONS_FILE]: text,
    bytes: Buffer.byteLength(text, "utf8"),
    max_bytes: MAX_USER_INSTRUCTIONS_BYTES
  };
}

function normalizeUserInstructions(content) {
  if (typeof content !== "string") {
    throw new McpError("content must be a Markdown string", -32602);
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_USER_INSTRUCTIONS_BYTES) {
    throw new McpError(`user instructions exceed ${MAX_USER_INSTRUCTIONS_BYTES} bytes`, -32602);
  }
  return content;
}

function normalizeRuleName(name) {
  const normalized = String(name || "").trim();
  if (!RULE_FILES.has(normalized)) {
    throw new McpError(`Unknown rule: ${normalized}`, -32602);
  }
  return normalized;
}

function parseKindConfigs(json, fallbackConfigs) {
  let parsed = null;
  if (json) {
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new McpError(`invalid kinds.json: ${error.message}`, -32602);
    }
  }
  const entries = Array.isArray(parsed?.kinds) ? parsed.kinds : fallbackConfigs;
  const result = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const kind = normalizeKind(entry.kind);
    if (seen.has(kind)) continue;
    seen.add(kind);
    result.push({
      kind,
      color: normalizeKindColor(entry.color || generateKindColor(kind, result))
    });
  }
  return result;
}

function normalizeKind(kind) {
  const normalized = String(kind || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new McpError(`invalid kind: ${kind}`, -32602);
  }
  return normalized;
}

function normalizeKindColor(color) {
  if (!color || typeof color !== "object" || Array.isArray(color)) {
    throw new McpError("kind color must include fill and stroke", -32602);
  }
  const fill = normalizeCssColor(color.fill, "fill");
  const stroke = normalizeCssColor(color.stroke, "stroke");
  return { fill, stroke };
}

function normalizeCssColor(value, field) {
  const color = String(value || "").trim();
  const hex = /^#[0-9a-f]{6}$/i;
  const hsl = /^hsl\(\s*(?:[0-9]|[1-9][0-9]|[1-2][0-9]{2}|3[0-5][0-9]|360)\s+(?:[0-9]|[1-9][0-9]|100)%\s+(?:[0-9]|[1-9][0-9]|100)%\s*\)$/;
  if (!hex.test(color) && !hsl.test(color)) {
    throw new McpError(`kind color ${field} must be a #rrggbb or hsl(H S% L%) value`, -32602);
  }
  return color;
}

function generateKindColor(kind, existingConfigs = []) {
  const used = new Set(existingConfigs.map((item) => JSON.stringify(item.color)));
  const start = hashNumber(kind) % KIND_COLOR_PALETTE.length;
  for (let offset = 0; offset < KIND_COLOR_PALETTE.length; offset += 1) {
    const color = KIND_COLOR_PALETTE[(start + offset) % KIND_COLOR_PALETTE.length];
    if (!used.has(JSON.stringify(color))) return color;
  }
  return KIND_COLOR_PALETTE[start];
}

function hashNumber(value) {
  let hash = 0;
  const text = String(value || "kind");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function kindConfigsText(configs) {
  return `${JSON.stringify({ kinds: configs }, null, 2)}\n`;
}

function defaultKindsConfigText() {
  const configs = DEFAULT_KIND_NAMES.map((kind, index) => ({
    kind,
    color: KIND_COLOR_PALETTE[index % KIND_COLOR_PALETTE.length]
  }));
  return kindConfigsText(configs);
}

function defaultKindsRule() {
  return [
    "# Kinds",
    "",
    "The list is open. A new kind may be proposed when no existing kind fits,",
    "but it must remain reusable.",
    "",
    "Starter kinds:",
    "",
    "- `project`",
    "- `task`",
    "- `idea`",
    "- `decision`",
    "- `routine`",
    "- `preference`",
    "- `resource`",
    "- `person`",
    "- `organization`",
    "- `watch_topic`",
    "- `event`",
    ""
  ].join("\n");
}

function now() {
  return new Date().toISOString();
}

function dateValue(value, { dateOnlyEndOfDay = false } = {}) {
  const normalized = normalizeDateInputForParsing(value, { dateOnlyEndOfDay });
  const time = Date.parse(normalized || "");
  return Number.isNaN(time) ? 0 : time;
}

function normalizeEvent({ by = "agent", action, summary, details = {} }) {
  if (!action || typeof action !== "string") {
    throw new McpError("event.action is required", -32602);
  }
  if (!summary || typeof summary !== "string") {
    throw new McpError("event.summary is required", -32602);
  }
  return {
    at: now(),
    by,
    action,
    summary,
    details
  };
}

function normalizeLimit(limit) {
  const value = Number.isInteger(limit) ? limit : 50;
  return Math.max(1, Math.min(value, 500));
}

function summarizeObject(object, objectById) {
  return {
    id: object.id,
    kind: object.kind,
    title: object.title,
    summary: object.summary || "",
    priority: object.priority,
    relation_count: object.relations?.length || 0,
    relations: (object.relations || []).map((relation) => {
      const target = objectById.get(relation.to);
      return {
        to: relation.to,
        importance: relation.importance,
        target_title: target?.title || "",
        target_kind: target?.kind || "",
        target_missing: !target
      };
    }),
    dates: {
      created_at: object.dates?.created_at || "",
      updated_at: object.dates?.updated_at || "",
      deadline_at: object.dates?.deadline_at || "",
      completed_at: object.dates?.completed_at || "",
      archived_at: object.dates?.archived_at || ""
    }
  };
}

function dueTaskSummary(object, agents = {}) {
  return {
    id: object.id,
    title: object.title,
    summary: object.summary || "",
    deadline_at: object.dates?.deadline_at || "",
    completed_at: object.dates?.completed_at || "",
    created_at: object.dates?.created_at || "",
    updated_at: object.dates?.updated_at || "",
    by: agents.created_by || "",
    priority: normalizeNodePriority(object.priority),
    relations: object.relations || []
  };
}

function completedNodeSummary(object, agents = {}) {
  return {
    id: object.id,
    kind: object.kind,
    title: object.title,
    summary: object.summary || "",
    priority: normalizeNodePriority(object.priority),
    completed_at: object.dates?.completed_at || "",
    deadline_at: object.dates?.deadline_at || "",
    created_at: object.dates?.created_at || "",
    updated_at: object.dates?.updated_at || "",
    by: agents.archived_by || agents.completed_by || "",
    archived: Boolean(object.dates?.archived_at)
  };
}

function eventAgentSummaries(events = []) {
  const byId = new Map();
  for (const event of [...events].sort((a, b) => dateValue(a.at) - dateValue(b.at))) {
    const id = event.id || "";
    if (!id) continue;
    const summary = byId.get(id) || {};
    if (event.action === "create" && !summary.created_by) {
      summary.created_by = event.by || "";
    }
    if (event.action === "archive") {
      summary.archived_by = event.by || "";
    }
    if (event.action === "update" && isCompletedAtEvent(event)) {
      summary.completed_by = event.by || "";
    }
    byId.set(id, summary);
  }
  return byId;
}

function isCompletedAtEvent(event) {
  const details = event.details || {};
  return details.field === "completed_at" || Object.prototype.hasOwnProperty.call(details.next || {}, "completed_at");
}

function eventActivitySummary(event, objectById) {
  const object = objectById.get(event.id);
  const relation = relationEventSummary(event);
  return {
    id: event.id || "",
    kind: relation ? "relation" : object?.kind || event.details?.kind || "",
    title: object?.title || event.details?.title || event.id || "Deleted node",
    priority: object ? normalizeNodePriority(object.priority) : 0.5,
    action: event.action || "",
    summary: event.summary || actionLabel(event.action),
    at: event.at || "",
    by: event.by || "",
    relation,
    node_available: Boolean(object && !object.dates?.archived_at)
  };
}

function relationEventSummary(event) {
  if (!isRelationAction(event.action)) return null;
  const details = event.details || {};
  const previous = details.previous || {};
  const next = details.next || {};
  const added = Array.isArray(details.added) ? details.added[0] || {} : {};
  return {
    from: event.id || "",
    to: details.to || next.to || added.to || previous.to || "",
    importance: details.importance || next.importance || added.importance || previous.importance || 0.5,
    previous_to: previous.to || "",
    next_to: next.to || ""
  };
}

function isRelationAction(action) {
  return action === "relate" || action === "update_relation" || action === "delete_relation";
}

function actionLabel(action) {
  const labels = {
    create: "Created",
    update: "Updated",
    relate: "Relation",
    update_relation: "Updated relation",
    delete_relation: "Deleted relation",
    archive: "Archived",
    delete: "Deleted"
  };
  return labels[action] || String(action || "Action");
}

function emptyDatesLast(left, right) {
  const leftTime = dateValue(left);
  const rightTime = dateValue(right);
  if (leftTime && rightTime) return leftTime - rightTime;
  if (leftTime) return -1;
  if (rightTime) return 1;
  return 0;
}

function inputDeadline(input) {
  if (Object.prototype.hasOwnProperty.call(input, "deadline_at")) {
    return normalizeDateString(input.deadline_at);
  }
  if (input.dates && Object.prototype.hasOwnProperty.call(input.dates, "deadline_at")) {
    return normalizeDateString(input.dates.deadline_at);
  }
  return undefined;
}

function inputCompleted(input) {
  if (Object.prototype.hasOwnProperty.call(input, "completed_at")) {
    return normalizeDateString(input.completed_at);
  }
  if (input.dates && Object.prototype.hasOwnProperty.call(input.dates, "completed_at")) {
    return normalizeDateString(input.dates.completed_at);
  }
  return undefined;
}

function normalizeDateString(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (isIsoDateOnly(text)) return text;
  const normalized = text.replace(" ", "T");
  if (!Number.isNaN(Date.parse(normalized))) return normalized;
  throw new McpError("date must be an ISO date or ISO datetime", -32602);
}

function normalizeDateInputForParsing(value, { dateOnlyEndOfDay = false } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isIsoDateOnly(text)) {
    return `${text}T${dateOnlyEndOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
  }
  return text.replace(" ", "T");
}

function isIsoDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizeViewUrl(value) {
  return String(value || "").trim().replace(/#.*$/, "").replace(/\/$/, "");
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "memory";
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wordsFor(value) {
  return new Set(normalizeSearchText(value).match(/[a-z0-9]+/g) || []);
}

function normalizeObjects(objects) {
  return (objects || []).map((object) => normalizeObject(object)).filter(Boolean);
}

function normalizeObject(object) {
  if (!object) return null;
  return {
    ...object,
    priority: normalizeNodePriority(object.priority),
    relations: normalizeRelations(object.relations)
  };
}

function isArchivedObject(object) {
  return Boolean(object?.dates?.archived_at);
}

function assertObjectMutable(object) {
  if (isArchivedObject(object)) {
    throw new McpError(`Archived object cannot be modified: ${object.id}`, -32602);
  }
}

function assertRelationEndpointMutable(objects, id) {
  const object = objects.find((item) => item.id === id);
  assertObjectMutable(object);
}

function normalizeNodePriority(priority) {
  const value = priority == null ? 0.5 : priority;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new McpError("object priority must be a number >= 0 and <= 1", -32602);
  }
  return value;
}

function normalizeRelations(relations) {
  return (Array.isArray(relations) ? relations : []).map(normalizeRelation);
}

function normalizeRelation(relation) {
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    throw new McpError("relation must be an object", -32602);
  }
  if (!relation.to) throw new McpError("relation.to is required", -32602);
  validateId(relation.to);
  const importance = relation.importance == null ? 0.5 : relation.importance;
  validateRelationImportance(importance);
  return { to: relation.to, importance };
}

function normalizeDirectRelationInputs(relations) {
  if (relations == null) return [];
  if (!Array.isArray(relations)) {
    throw new McpError("relations must be an array", -32602);
  }
  return relations.map((relation) => {
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
      throw new McpError("relations items must be objects", -32602);
    }
    if (!relation.to) throw new McpError("relation.to is required", -32602);
    validateId(relation.to);
    return normalizeRelation({ to: relation.to, importance: relation.importance });
  });
}

function relationPairKey(leftId, rightId) {
  return [leftId, rightId].sort().join("\u0000");
}

function findExistingRelationPair(objects, pairKey) {
  for (const object of objects) {
    for (const relation of object.relations || []) {
      if (relationPairKey(object.id, relation.to) === pairKey) {
        return { from_id: object.id, to_id: relation.to, importance: relation.importance };
      }
    }
  }
  return null;
}

function validateDistinctRelationIds(fromId, toId) {
  if (fromId === toId) {
    throw new McpError("A relation requires two distinct objects", -32602);
  }
}

function validateRelationImportance(importance) {
  if (typeof importance !== "number" || !Number.isFinite(importance) || importance <= 0 || importance > 1) {
    throw new McpError("relation importance must be a number > 0 and <= 1", -32602);
  }
}

function validateObject(object) {
  validateUniqueOutgoingRelations(object);
  const errors = validateSchema(object, OBJECT_SCHEMA);
  if (errors.length > 0) {
    throw new McpError(`object schema validation failed: ${errors.join("; ")}`, -32602);
  }
}

function validateUniqueOutgoingRelations(object) {
  const seen = new Set();
  for (const relation of object.relations || []) {
    validateDistinctRelationIds(object.id, relation.to);
    const key = relationPairKey(object.id, relation.to);
    if (seen.has(key)) {
      throw new McpError(`object schema validation failed: duplicate relation between ${object.id} and ${relation.to}`, -32602);
    }
    seen.add(key);
  }
}

function validateSchema(value, schema, pathName = "object") {
  const errors = [];
  if (!matchesType(value, schema.type)) {
    return [`${pathName} must be ${schema.type}`];
  }

  if (schema.type === "object") {
    const keys = Object.keys(value);
    for (const field of schema.required || []) {
      if (!(field in value)) errors.push(`${pathName}.${field} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of keys) {
        if (!schema.properties?.[key]) errors.push(`${pathName}.${key} is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in value) {
        errors.push(...validateSchema(value[key], childSchema, `${pathName}.${key}`));
      }
    }
  }

  if (schema.type === "array") {
    value.forEach((item, index) => {
      errors.push(...validateSchema(item, schema.items, `${pathName}[${index}]`));
    });
  }

  if (schema.type === "string") {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${pathName} must not be empty`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pathName} does not match ${schema.pattern}`);
    }
  }

  if (schema.type === "number") {
    if (schema.exclusiveMinimum != null && !(value > schema.exclusiveMinimum)) {
      errors.push(`${pathName} must be greater than ${schema.exclusiveMinimum}`);
    }
    if (schema.minimum != null && value < schema.minimum) {
      errors.push(`${pathName} must be at least ${schema.minimum}`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      errors.push(`${pathName} must be at most ${schema.maximum}`);
    }
  }

  return errors;
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validateId(id) {
  if (!/^obj_[a-z0-9_]+$/.test(id || "")) {
    throw new McpError(`invalid object id: ${id}`, -32602);
  }
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeContentLines(content) {
  return (Array.isArray(content) ? content : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}
