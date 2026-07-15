import assert from "node:assert/strict";
import test from "node:test";
import { BrainStore } from "../src/brain-store.js";

async function createTestObject(store, { object, by } = {}) {
  const created = await store.createObject({
    id: object.id,
    kind: object.kind,
    title: object.title,
    summary: object.summary,
    priority: object.priority,
    content: object.content,
    deadline_at: object.deadline_at ?? object.dates?.deadline_at,
    completed_at: object.completed_at ?? object.dates?.completed_at,
    by
  });
  for (const relation of object.relations || []) {
    await store.createRelation({
      from_id: created.id,
      to_id: relation.to,
      importance: relation.importance,
      by
    });
  }
  const stored = await store.read(created.id);
  return { ...stored, object: stored };
}

test("createObject writes object and automatic event", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);

  const result = await createTestObject(store, {
    object: {
      kind: "project",
      title: "Second Brain MCP",
      summary: "External memory represented as a graph.",
      content: ["Explicit relations."]
    },
    by: "test"
  });

  const object = result.object;
  assert.equal(object.id, "obj_second_cerveau_mcp");
  assert.equal((await store.adapter.listObjects()).length, 1);
  const events = await store.readObjectEvents({ id: object.id });
  assert.equal(events.id, object.id);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].action, "create");
  assert.equal(events.events[0].by, "test");
});

test("createObject can add outgoing relations directly and skips duplicate input", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const target = await createTestObject(store, { object: { title: "AI", kind: "idea" } });

  const result = await store.createObject({
    title: "Project Alpha",
    relations: [
      { to: target.id },
      { to: target.id }
    ]
  });

  assert.deepEqual(result.object.relations, [{ to: target.id, importance: 0.5 }]);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "duplicate_relation");
});

test("createObject uses explicit ids without consolidation", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const project = await createTestObject(store, {
    object: {
      id: "obj_printable_children_books_ai",
      kind: "project",
      title: "Printable AI-generated children books library",
      summary: "Printable library project.",
      content: ["Children books project content."]
    },
    by: "test"
  });

  const ia = await createTestObject(store, {
    object: {
      id: "obj_ai",
      kind: "idea",
      title: "AI",
      summary: "Cross-cutting node about artificial intelligence.",
      content: ["AI node content."]
    },
    by: "test"
  });

  const storedProject = await store.read(project.id);
  const storedIa = await store.read("obj_ai");

  assert.equal(ia.id, "obj_ai");
  assert.equal(storedProject.title, "Printable AI-generated children books library");
  assert.equal(storedProject.summary, "Printable library project.");
  assert.deepEqual(storedProject.content, ["Children books project content."]);
  assert.equal(storedIa.title, "AI");
  assert.equal((await store.adapter.listObjects()).length, 2);
});

test("createObject refuses an existing id instead of merging", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await createTestObject(store, { object: { id: "obj_project_alpha", title: "Project Alpha" } });

  await assert.rejects(
    createTestObject(store, { object: { title: "Project Alpha" } }),
    /Object already exists: obj_project_alpha/
  );
  assert.equal((await store.adapter.listObjects()).length, 1);
});

test("replaceContent replaces content without touching relations", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await createTestObject(store, {
    object: {
      id: "obj_prompt_inspiration",
      kind: "website",
      title: "Prompt Inspiration",
      summary: "AI blog.",
      content: [
        "Site : https://example.com/",
        "Should be linked to the AI and SEO domains."
      ],
      relations: [{ to: "obj_ai" }]
    }
  });

  const result = await store.replaceContent({
    id: "obj_prompt_inspiration",
    content: ["Site : https://example.com/"]
  });

  assert.deepEqual(result.content, ["Site : https://example.com/"]);
  assert.deepEqual(result.relations, [{ to: "obj_ai", importance: 0.5 }]);
});

test("removeContent removes exact content lines", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await createTestObject(store, {
    object: {
      id: "obj_prompt_inspiration",
      kind: "website",
      title: "Prompt Inspiration",
      summary: "AI blog.",
      content: [
        "Site : https://example.com/",
        "Should be linked to the AI and SEO domains."
      ]
    }
  });

  const result = await store.removeContent({
    id: "obj_prompt_inspiration",
    content: ["Should be linked to the AI and SEO domains."]
  });

  assert.deepEqual(result.content, ["Site : https://example.com/"]);
});

test("updateObject updates several metadata fields without touching content or relations", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const target = await createTestObject(store, { object: { title: "AI", kind: "idea" } });
  const object = await createTestObject(store, {
    object: {
      title: "Project Alpha",
      kind: "project",
      summary: "Old summary.",
      priority: 0.5,
      content: ["Durable note."],
      relations: [{ to: target.id }]
    }
  });

  const updated = await store.updateObject({
    id: object.id,
    title: "Project Beta",
    summary: "New summary.",
    priority: 0.8,
    deadline_at: "2026-08-01T00:00:00.000Z"
  });

  assert.equal(updated.title, "Project Beta");
  assert.equal(updated.summary, "New summary.");
  assert.equal(updated.priority, 0.8);
  assert.equal(updated.dates.deadline_at, "2026-08-01T00:00:00.000Z");
  assert.deepEqual(updated.content, ["Durable note."]);
  assert.deepEqual(updated.relations, [{ to: target.id, importance: 0.5 }]);
});

test("updateObject can add outgoing relations directly without duplicating existing ones", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const target = await createTestObject(store, { object: { title: "AI", kind: "idea" } });
  const object = await createTestObject(store, {
    object: {
      title: "Project Alpha",
      kind: "project",
      relations: [{ to: target.id }]
    }
  });

  const updated = await store.updateObject({
    id: object.id,
    relations: [
      { to: target.id },
      { to: target.id, importance: 0.7 }
    ]
  });

  assert.deepEqual(updated.relations, [
    { to: target.id, importance: 0.5 }
  ]);
  assert.equal(updated.warnings.length, 1);
  assert.equal(updated.warnings[0].code, "duplicate_relation");
});

test("context pack touches last_seen_at", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const object = await createTestObject(store, {
    object: { title: "Project Alpha", summary: "Durable context." }
  });

  const pack = await store.buildContextPack({ query: "alpha" });
  const touched = await store.read(object.id);

  assert.equal(pack.objects[0].id, object.id);
  assert.notEqual(touched.dates.last_seen_at, "");
});

test("createRelation creates one untyped link and reports duplicates without writing", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const target = await createTestObject(store, { object: { title: "PostgreSQL", kind: "resource" } });

  const updated = await store.createRelation({ from_id: source.id, to_id: target.id, importance: 0.9 });
  const updatedAt = updated.dates.updated_at;

  assert.deepEqual(updated.relations, [{ to: target.id, importance: 0.9 }]);
  const duplicate = await store.createRelation({ from_id: source.id, to_id: target.id });
  assert.equal(duplicate.status, "already_exists");
  assert.equal(duplicate.warnings[0].code, "duplicate_relation");
  assert.deepEqual((await store.read(source.id)).relations, [{ to: target.id, importance: 0.9 }]);
  assert.equal((await store.read(source.id)).dates.updated_at, updatedAt);
  const reverseDuplicate = await store.createRelation({ from_id: target.id, to_id: source.id, importance: 0.7 });
  assert.equal(reverseDuplicate.status, "already_exists");
  assert.deepEqual((await store.read(target.id)).relations, []);
  await assert.rejects(
    () => store.createRelation({ from_id: source.id, to_id: "obj_autre", importance: 0 }),
    /relation importance must be a number > 0 and <= 1/
  );
  const events = await store.readObjectEvents({ id: source.id });
  assert.deepEqual(events.events.map((event) => event.action), ["create", "relate"]);
});

test("readGlobalEvents excludes relation events from activity history", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const target = await createTestObject(store, { object: { title: "PostgreSQL", kind: "resource" } });

  await store.createRelation({ from_id: source.id, to_id: target.id });

  const globalEvents = await store.readGlobalEvents({ limit: 10 });

  assert.equal(globalEvents.some((event) => event.action === "relate"), false);
  assert.deepEqual(globalEvents.map((event) => event.action), ["create", "create"]);
});

test("createRelation rejects an existing reverse link", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const target = await createTestObject(store, { object: { title: "PostgreSQL", kind: "resource" } });

  await store.createRelation({ from_id: target.id, to_id: source.id });
  await assert.rejects(
    () => store.createRelation({ from_id: source.id, to_id: target.id }),
    /Relation already exists between/
  );
});

test("updateRelation changes target and keeps automatic event", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const firstTarget = await createTestObject(store, { object: { title: "PostgreSQL", kind: "resource" } });
  const secondTarget = await createTestObject(store, { object: { title: "Vercel", kind: "resource" } });
  await store.createRelation({ from_id: source.id, to_id: firstTarget.id });

  const updated = await store.updateRelation({
    from_id: source.id,
    to_id: firstTarget.id,
    new_to_id: secondTarget.id,
    importance: 0.8,
    by: "test"
  });

  assert.deepEqual(updated.relations, [{ to: secondTarget.id, importance: 0.8 }]);
  const events = await store.readObjectEvents({ id: source.id });
  assert.deepEqual(events.events.map((event) => event.action), ["create", "relate", "update_relation"]);
  assert.deepEqual(events.events.at(-1).details.previous, {
    to: firstTarget.id,
    importance: 0.5
  });
  assert.deepEqual(events.events.at(-1).details.next, {
    to: secondTarget.id,
    importance: 0.8
  });
});

test("updateRelation rejects missing relations, empty changes and conflicts", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const firstTarget = await createTestObject(store, { object: { title: "PostgreSQL", kind: "resource" } });
  const secondTarget = await createTestObject(store, { object: { title: "Vercel", kind: "resource" } });
  await store.createRelation({ from_id: source.id, to_id: firstTarget.id });
  await store.createRelation({ from_id: source.id, to_id: secondTarget.id });

  await assert.rejects(
    () => store.updateRelation({ from_id: source.id, to_id: firstTarget.id }),
    /new_to_id or importance is required/
  );
  await assert.rejects(
    () => store.updateRelation({ from_id: source.id, to_id: "obj_missing", new_to_id: secondTarget.id }),
    /Unknown relation between/
  );
  await assert.rejects(
    () => store.updateRelation({
      from_id: source.id,
      to_id: firstTarget.id,
      new_to_id: secondTarget.id
    }),
    /Relation already exists/
  );
});

test("deleteRelation removes one relation and keeps automatic event", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const firstTarget = await createTestObject(store, { object: { title: "PostgreSQL", kind: "resource" } });
  const secondTarget = await createTestObject(store, { object: { title: "Vercel", kind: "resource" } });
  await store.createRelation({ from_id: source.id, to_id: firstTarget.id });
  await store.createRelation({ from_id: source.id, to_id: secondTarget.id, importance: 0.8 });

  const updated = await store.deleteRelation({
    from_id: source.id,
    to_id: firstTarget.id,
    reason: "Lien devenu faux.",
    by: "test"
  });

  assert.deepEqual(updated.relations, [{ to: secondTarget.id, importance: 0.8 }]);
  const events = await store.readObjectEvents({ id: source.id });
  assert.deepEqual(events.events.map((event) => event.action), [
    "create",
    "relate",
    "relate",
    "delete_relation"
  ]);
  assert.equal(events.events.at(-1).details.reason, "Lien devenu faux.");
  await assert.rejects(
    () => store.deleteRelation({ from_id: source.id, to_id: firstTarget.id }),
    /Unknown relation/
  );
});

test("deleteObject removes an isolated object and keeps automatic event", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const object = await createTestObject(store, { object: { title: "Wrong node" }, by: "test" });

  const result = await store.deleteObject({
    id: object.id,
    reason: "Cree par erreur avec de mauvaises informations.",
    by: "test"
  });

  assert.deepEqual(result, { id: object.id, deleted: true });
  assert.equal(await adapter.getObject(object.id), null);
  const events = await store.readObjectEvents({ id: object.id });
  assert.deepEqual(events.events.map((event) => event.action), ["create", "delete"]);
  assert.equal(events.events.at(-1).details.reason, "Cree par erreur avec de mauvaises informations.");
});

test("deleteObject rejects objects with incoming or outgoing relations", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const target = await createTestObject(store, { object: { title: "Resource Beta", kind: "resource" } });

  await store.createRelation({ from_id: source.id, to_id: target.id });

  await assert.rejects(
    () => store.deleteObject({ id: source.id, reason: "Test outgoing relation." }),
    /Cannot delete linked object .*outgoing:obj_ressource_beta/
  );
  await assert.rejects(
    () => store.deleteObject({ id: target.id, reason: "Test incoming relation." }),
    /Cannot delete linked object .*incoming:obj_project_alpha/
  );
  assert.notEqual(await adapter.getObject(source.id), null);
  assert.notEqual(await adapter.getObject(target.id), null);
});

test("deleteObjectCascade removes linked objects after cleaning relations", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const deleted = await createTestObject(store, { object: { title: "Duplicate node" } });
  const target = await createTestObject(store, { object: { title: "Resource Beta", kind: "resource" } });

  await store.createRelation({ from_id: source.id, to_id: deleted.id, importance: 0.7 });
  await store.createRelation({ from_id: deleted.id, to_id: target.id, importance: 0.8 });

  const result = await store.deleteObjectCascade({
    id: deleted.id,
    reason: "Duplicate node created by mistake.",
    by: "test"
  });

  assert.equal(result.deleted, true);
  assert.equal(result.id, deleted.id);
  assert.deepEqual(result.removed_relations, [
    { from: deleted.id, to: target.id, importance: 0.8 },
    { from: source.id, to: deleted.id, importance: 0.7 }
  ]);
  assert.equal(await adapter.getObject(deleted.id), null);
  assert.deepEqual((await store.read(source.id)).relations, []);
  assert.notEqual(await adapter.getObject(target.id), null);
  const sourceEvents = await store.readObjectEvents({ id: source.id });
  assert.equal(sourceEvents.events.at(-1).action, "delete_relation");
  assert.equal(sourceEvents.events.at(-1).details.deleted_with_object, deleted.id);
  const deletedEvents = await store.readObjectEvents({ id: deleted.id });
  assert.equal(deletedEvents.events.at(-1).action, "delete");
  assert.equal(deletedEvents.events.at(-1).details.deleted_relations.length, 2);
});

test("archiveObject marks linked objects archived without removing them", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const source = await createTestObject(store, { object: { title: "Project Alpha" } });
  const target = await createTestObject(store, { object: { title: "Resource Beta", kind: "resource" } });
  await store.createRelation({ from_id: source.id, to_id: target.id });

  const result = await store.archiveObject({
    id: target.id,
    reason: "Node created for a test.",
    by: "test"
  });
  const archived = await store.read(target.id);

  assert.equal(result.id, target.id);
  assert.equal(result.archived, true);
  assert.equal(archived.dates.archived_at, result.archived_at);
  assert.equal((await store.search({ query: "beta" })).length, 0);
  assert.equal((await store.search({ query: "beta", include_archived: true })).length, 1);
  assert.notEqual(await adapter.getObject(target.id), null);
  const events = await store.readObjectEvents({ id: target.id });
  assert.equal(events.events.at(-1).action, "archive");
  assert.equal(events.events.at(-1).details.reason, "Node created for a test.");
});

test("archived objects are frozen against edits, touches and relation changes", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const archived = await createTestObject(store, { object: { title: "Archived project" } });
  const active = await createTestObject(store, { object: { title: "Active project" } });
  const linked = await createTestObject(store, { object: { title: "Linked resource" } });
  const source = await createTestObject(store, { object: { title: "Source project" } });
  await store.createRelation({ from_id: active.id, to_id: linked.id });
  await store.createRelation({ from_id: source.id, to_id: active.id });

  await store.archiveObject({ id: archived.id, reason: "Test archive." });
  await store.archiveObject({ id: linked.id, reason: "Linked archive test." });
  await store.archiveObject({ id: source.id, reason: "Source archive test." });

  await assert.rejects(
    () => store.setSummary({ id: archived.id, summary: "Forbidden change." }),
    /Archived object cannot be modified/
  );
  await assert.rejects(
    () => store.addContent({ id: archived.id, content: ["Forbidden change."] }),
    /Archived object cannot be modified/
  );
  await assert.rejects(
    () => store.updateObject({ id: archived.id, title: "Nouveau titre" }),
    /Archived object cannot be modified/
  );
  await assert.rejects(
    () => store.createRelation({ from_id: active.id, to_id: archived.id }),
    /Archived object cannot be modified/
  );
  await assert.rejects(
    () => store.deleteRelation({ from_id: active.id, to_id: linked.id, reason: "Forbidden change." }),
    /Archived object cannot be modified/
  );
  await assert.rejects(
    () => store.updateRelation({ from_id: source.id, to_id: active.id, importance: 0.9 }),
    /Archived object cannot be modified/
  );

  const beforeTouch = await store.read(archived.id);
  await store.read(archived.id, { touch: true });
  const afterTouch = await store.read(archived.id);
  assert.equal(afterTouch.dates.last_seen_at || "", beforeTouch.dates.last_seen_at || "");
  assert.deepEqual((await store.read(active.id)).relations, [{ to: linked.id, importance: 0.5 }]);
});

test("overview excludes archived objects by default", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const active = await createTestObject(store, { object: { title: "Active project" } });
  const archived = await createTestObject(store, { object: { title: "Archived project" } });
  await store.archiveObject({ id: archived.id, reason: "Test archive." });

  const overview = await store.getOverview();
  const overviewWithArchived = await store.getOverview({ include_archived: true });

  assert.deepEqual(overview.nodes.map((object) => object.id), [active.id]);
  assert.equal(overview.objectCount, 1);
  assert.equal(overview.activity[0].id, archived.id);
  assert.equal(overview.activity[0].action, "archive");
  assert.equal(overviewWithArchived.objectCount, 2);
});

test("overview only lists completed or archived nodes that had deadlines", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const withoutDeadline = await createTestObject(store, { object: { title: "Archive without deadline" } });
  const withDeadline = await createTestObject(store, {
    object: {
      title: "Archive with deadline",
      deadline_at: "2026-07-20T00:00:00.000Z"
    }
  });
  await store.archiveObject({ id: withoutDeadline.id, reason: "Test Archive without deadline." });
  await store.archiveObject({ id: withDeadline.id, reason: "Test Archive with deadline." });

  const overview = await store.getOverview();

  assert.deepEqual(overview.completedNodes.map((object) => object.id), [withDeadline.id]);
  assert.equal(overview.completedNodes[0].deadline_at, "2026-07-20T00:00:00.000Z");
  assert.equal(overview.completedNodes[0].archived, true);
});

test("overview returns counts, kinds, and newest objects", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await adapter.putObject({
    id: "obj_old_idea",
    kind: "idea",
    title: "Old idea",
    summary: "",
    content: [],
    relations: [],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
      last_seen_at: ""
    }
  });
  await adapter.putObject({
    id: "obj_recent_project",
    kind: "project",
    title: "Recent project",
    summary: "",
    content: [],
    relations: [{ to: "obj_old_idea" }],
    dates: {
      created_at: "2026-01-02T10:00:00Z",
      updated_at: "2026-01-02T10:00:00Z",
      last_seen_at: ""
    }
  });
  const overview = await store.getOverview({ latestLimit: 1 });

  assert.equal(overview.objectCount, 2);
  assert.equal(overview.relationCount, 1);
  assert.deepEqual(overview.kinds, [
    { kind: "idea", count: 1 },
    { kind: "project", count: 1 }
  ]);
  assert.equal(overview.latest[0].id, "obj_recent_project");
  assert.deepEqual(overview.activity, []);
  assert.deepEqual(
    overview.nodes.map((object) => object.id),
    ["obj_recent_project", "obj_old_idea"]
  );
  assert.deepEqual(overview.nodes[0].relations, [
    { to: "obj_old_idea", importance: 0.5 }
  ]);
});

test("exportNodesSummary omits content and enriches relation targets", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await adapter.putObject({
    id: "obj_idea_alpha",
    kind: "idea",
    title: "Idea Alpha",
    summary: "Idea synthesis.",
    content: ["Detail intentionally omitted from the export."],
    relations: [{ to: "obj_project_beta", importance: 0.8 }],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-02T10:00:00Z",
      last_seen_at: ""
    }
  });
  await adapter.putObject({
    id: "obj_project_beta",
    kind: "project",
    title: "Project Beta",
    summary: "Project synthesis.",
    content: ["Autre detail absent."],
    relations: [],
    dates: {
      created_at: "2026-01-03T10:00:00Z",
      updated_at: "2026-01-03T10:00:00Z",
      last_seen_at: ""
    }
  });

  const exportData = await store.exportNodesSummary();

  assert.equal(exportData.object_count, 2);
  assert.equal(exportData.relation_count, 1);
  assert.deepEqual(exportData.nodes.map((object) => object.id), ["obj_idea_alpha", "obj_project_beta"]);
  assert.equal("content" in exportData.nodes[0], false);
  assert.deepEqual(exportData.nodes[0].relations, [
    {
      to: "obj_project_beta",
      importance: 0.8,
      target_title: "Project Beta",
      target_kind: "project",
      target_missing: false
    }
  ]);
});

test("exportNodesSummary filters archived objects by default", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const active = await createTestObject(store, { object: { title: "Active project" } });
  const archived = await createTestObject(store, { object: { title: "Archived project" } });
  await store.archiveObject({ id: archived.id, reason: "Test archive." });

  const exportData = await store.exportNodesSummary();
  const exportWithArchived = await store.exportNodesSummary({ include_archived: true });

  assert.deepEqual(exportData.nodes.map((object) => object.id), [active.id]);
  assert.deepEqual(exportWithArchived.nodes.map((object) => object.id), [active.id, archived.id]);
});

test("createObject stores task deadlines and listDueTasks sorts by deadline then priority", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await createTestObject(store, {
    object: {
      title: "Later task",
      kind: "task",
      deadline_at: "2026-07-20T00:00:00.000Z",
      priority: 1
    }
  });
  await createTestObject(store, {
    object: {
      title: "Soon task",
      kind: "task",
      dates: { deadline_at: "2026-07-10T00:00:00.000Z" },
      priority: 0.5
    }
  });
  await createTestObject(store, {
    object: {
      title: "Task without date",
      kind: "task"
    }
  });

  const dueTasks = await store.listDueTasks({ include_no_deadline: true });
  const filtered = await store.listDueTasks({ due_before: "2026-07-11T00:00:00.000Z" });

  assert.deepEqual(
    dueTasks.tasks.map((task) => task.id),
    ["obj_task_soon", "obj_task_later", "obj_task_without_date"]
  );
  assert.equal(dueTasks.tasks[0].deadline_at, "2026-07-10T00:00:00.000Z");
  assert.equal(dueTasks.tasks[1].priority, 1);
  assert.equal(dueTasks.tasks[2].priority, 0.5);
  assert.deepEqual(filtered.tasks.map((task) => task.id), ["obj_task_soon"]);
});

test("listDueTasks keeps precise deadline times and date-only filters include the whole day", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await createTestObject(store, {
    object: {
      title: "Morning task",
      kind: "task",
      deadline_at: "2026-07-12T09:30:00.000Z",
      priority: 0.5
    }
  });
  await createTestObject(store, {
    object: {
      title: "Evening task",
      kind: "task",
      deadline_at: "2026-07-12T18:00:00.000Z",
      priority: 1
    }
  });

  const dueToday = await store.listDueTasks({ due_before: "2026-07-12" });

  assert.equal(dueToday.due_before, "2026-07-12");
  assert.deepEqual(
    dueToday.tasks.map((task) => task.id),
    ["obj_task_morning", "obj_task_evening"]
  );
  assert.equal(dueToday.tasks[0].deadline_at, "2026-07-12T09:30:00.000Z");
});

test("search accepts multiple queries and returns recent objects", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await adapter.putObject({
    id: "obj_bot_trading",
    kind: "project",
    title: "Bot trading",
    summary: "Automatisation crypto.",
    content: ["Choix du CEX."],
    relations: [],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
      last_seen_at: ""
    }
  });
  await adapter.putObject({
    id: "obj_choix_cex",
    kind: "decision",
    title: "Choix du CEX",
    summary: "Decision recente pour le bot.",
    content: ["Plateforme crypto centralisee."],
    relations: [],
    dates: {
      created_at: "2026-01-02T10:00:00Z",
      updated_at: "2026-01-03T10:00:00Z",
      last_seen_at: ""
    }
  });

  const results = await store.search({ queries: ["bot", "cex"] });

  assert.deepEqual(
    results.map((object) => object.id),
    ["obj_choix_cex", "obj_bot_trading"]
  );
  assert.equal(results[0].id, "obj_choix_cex");
});

test("search is accent-insensitive and includes content", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await adapter.putObject({
    id: "obj_rules_brain",
    kind: "task",
    title: "BRAIN Rules",
    summary: "Technical task.",
    content: ["Strengthen logical links after creation."],
    relations: [],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
      last_seen_at: ""
    }
  });

  const byTitle = await store.search({ query: "rules" });
  const byContent = await store.search({ query: "creation" });

  assert.deepEqual(byTitle.map((object) => object.id), ["obj_rules_brain"]);
  assert.deepEqual(byContent.map((object) => object.id), ["obj_rules_brain"]);
});

test("search includes linked object text", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await adapter.putObject({
    id: "obj_status_project_in_production",
    kind: "status",
    title: "Project in production",
    summary: "Status for published projects.",
    content: [],
    relations: [],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
      last_seen_at: ""
    }
  });
  await adapter.putObject({
    id: "obj_markdodo",
    kind: "project",
    title: "Markdodo",
    summary: "CMS Markdown.",
    content: [],
    relations: [{ to: "obj_status_project_in_production" }],
    dates: {
      created_at: "2026-01-02T10:00:00Z",
      updated_at: "2026-01-02T10:00:00Z",
      last_seen_at: ""
    }
  });

  const byLinkedStatus = await store.search({ query: "production", kind: "project" });

  assert.deepEqual(byLinkedStatus.map((object) => object.id), ["obj_markdodo"]);
});

test("empty search returns the most recent objects", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  await adapter.putObject({
    id: "obj_ancien",
    kind: "idea",
    title: "Ancien",
    summary: "",
    content: [],
    relations: [],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
      last_seen_at: ""
    }
  });
  await adapter.putObject({
    id: "obj_recent",
    kind: "idea",
    title: "Recent",
    summary: "",
    content: [],
    relations: [],
    dates: {
      created_at: "2026-01-02T10:00:00Z",
      updated_at: "2026-01-02T10:00:00Z",
      last_seen_at: ""
    }
  });

  const results = await store.search({ limit: 1 });

  assert.deepEqual(
    results.map((object) => object.id),
    ["obj_recent"]
  );
});

test("listKinds parses registered kinds from rules", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  adapter.rules.set(
    "kinds.json",
    JSON.stringify({
      kinds: [
        { kind: "project", color: { fill: "hsl(205 82% 88%)", stroke: "hsl(205 72% 35%)" } },
        { kind: "task", color: { fill: "hsl(32 90% 86%)", stroke: "hsl(28 78% 36%)" } },
        { kind: "project", color: { fill: "hsl(205 82% 88%)", stroke: "hsl(205 72% 35%)" } }
      ]
    })
  );

  assert.deepEqual(await store.listKinds(), ["project", "task"]);
});

test("getRules includes user instructions after structural rules", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter, undefined, {
    structuralRules: { "README.md": "Global BRAIN rules." }
  });
  await store.setUserInstructions({ content: "Prefer concise answers." });

  assert.deepEqual(await store.getRules(), {
    "README.md": "Global BRAIN rules.",
    "user_instructions.md": "Prefer concise answers."
  });
});

test("structural rules are not read from configurable storage when provided", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter, undefined, {
    structuralRules: {
      "README.md": "Tracked repo rules.",
      "editing_rules.md": "Tracked editing rules."
    }
  });
  adapter.rules.set("README.md", "");
  adapter.rules.set("editing_rules.md", "");

  assert.deepEqual(await store.getRules(), {
    "README.md": "Tracked repo rules.",
    "user_instructions.md": ""
  });
  assert.deepEqual(await store.getRule({ name: "editing_rules.md" }), {
    "editing_rules.md": "Tracked editing rules."
  });
});

test("setUserInstructions replaces content and enforces byte limit", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);

  const result = await store.setUserInstructions({ content: "# Preferences\n" });
  assert.equal(result["user_instructions.md"], "# Preferences\n");
  assert.equal(result.bytes, Buffer.byteLength("# Preferences\n", "utf8"));
  assert.equal(result.max_bytes, 32768);
  assert.deepEqual(await store.getUserInstructions(), {
    "user_instructions.md": "# Preferences\n",
    bytes: Buffer.byteLength("# Preferences\n", "utf8"),
    max_bytes: 32768
  });

  await assert.rejects(
    () => store.setUserInstructions({ content: "x".repeat(40000) }),
    /user instructions exceed 32768 bytes/
  );
});

test("setUserInstructions requires markdown string content", async () => {
  const store = new BrainStore(new MemoryAdapter());

  await assert.rejects(
    () => store.setUserInstructions({ content: ["not markdown"] }),
    /content must be a Markdown string/
  );
});

test("listKinds keeps reading legacy markdown kind rules", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  adapter.rules.set(
    "kinds.md",
    ["# Kinds", "", "- `project`", "- `task`", "- `project`", "- invalid-kind"].join("\n")
  );

  assert.deepEqual(await store.listKinds(), ["project", "task"]);
});

test("addKind registers a new kind once", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  adapter.rules.set(
    "kinds.json",
    JSON.stringify({
      kinds: [{ kind: "project", color: { fill: "hsl(205 82% 88%)", stroke: "hsl(205 72% 35%)" } }]
    })
  );

  const created = await store.addKind({ kind: "Concept" });
  const existing = await store.addKind({ kind: "concept" });

  assert.equal(created.kind, "concept");
  assert.equal(created.created, true);
  assert.deepEqual(created.color, existing.color);
  assert.deepEqual(existing, { kind: "concept", color: created.color, created: false, by: "agent" });
  assert.deepEqual(await store.listKinds(), ["project", "concept"]);
});

test("updateKind changes an existing kind color", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  adapter.rules.set(
    "kinds.json",
    JSON.stringify({
      kinds: [{ kind: "project", color: { fill: "hsl(205 82% 88%)", stroke: "hsl(205 72% 35%)" } }]
    })
  );

  const updated = await store.updateKind({
    kind: "project",
    color: { fill: "#dbeafe", stroke: "#1d4ed8" }
  });

  assert.deepEqual(updated.color, { fill: "#dbeafe", stroke: "#1d4ed8" });
  assert.deepEqual(await store.listKindConfigs(), [
    { kind: "project", color: { fill: "#dbeafe", stroke: "#1d4ed8" } }
  ]);
});

test("addKind rejects invalid kind names", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);

  await assert.rejects(
    () => store.addKind({ kind: "bad kind" }),
    /invalid kind: bad kind/
  );
});

test("putObject drops unsupported relation fields", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);

  await store.putObject({
    id: "obj_normalized_project",
    kind: "project",
    title: "Normalized project",
    summary: "",
    priority: 0.5,
    content: [],
    relations: [{ to: "obj_target", importance: 0.7, type: "uses", label: "extra field" }],
    dates: {
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
      last_seen_at: ""
    }
  });

  assert.deepEqual((await store.read("obj_normalized_project")).relations, [
    { to: "obj_target", importance: 0.7 }
  ]);
});

test("readObjectEvents returns latest events up to limit", async () => {
  const adapter = new MemoryAdapter();
  const store = new BrainStore(adapter);
  const object = await createTestObject(store, { object: { title: "Project Alpha" } });
  await store.setSummary({ id: object.id, summary: "Version deux." });
  await store.setSummary({ id: object.id, summary: "Version trois." });

  const events = await store.readObjectEvents({ id: object.id, limit: 2 });

  assert.deepEqual(events.events.map((event) => event.action), ["update", "update"]);
  assert.match(events.events[0].at, /^\d{4}-\d{2}-\d{2}T/);
});

class MemoryAdapter {
  constructor() {
    this.objects = new Map();
    this.events = new Map();
    this.rules = new Map();
    this.userInstructions = "";
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
    return Object.fromEntries(this.rules);
  }
  async getUserInstructions() {
    return this.userInstructions;
  }
  async setUserInstructions(content) {
    this.userInstructions = content;
  }
  async addKind(kind, color) {
    const configs = await this.listKindConfigs();
    if (!configs.some((item) => item.kind === kind)) {
      configs.push({ kind, color });
      this.rules.set("kinds.json", `${JSON.stringify({ kinds: configs }, null, 2)}\n`);
    }
  }
  async updateKind(kind, changes) {
    const configs = await this.listKindConfigs();
    const entry = configs.find((item) => item.kind === kind);
    if (entry && changes.color) {
      entry.color = changes.color;
      this.rules.set("kinds.json", `${JSON.stringify({ kinds: configs }, null, 2)}\n`);
    }
  }
  async listKindConfigs() {
    const rules = await this.getRules();
    if (rules["kinds.json"]) {
      const parsed = JSON.parse(rules["kinds.json"]);
      return parsed.kinds;
    }
    return [...new Set(String(rules["kinds.md"] || "")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*-\s+`?([a-z][a-z0-9_]*)`?\s*$/)?.[1])
      .filter(Boolean))]
      .map((kind) => ({ kind, color: { fill: "hsl(205 82% 88%)", stroke: "hsl(205 72% 35%)" } }));
  }
}
