# AI Second Brain

Web MCP connector for AI Second Brain, deployable on Vercel.

## What Is AI Second Brain?

AI Second Brain is a small remote memory server for AI agents. It stores durable user or project context as JSON objects connected by untyped relations, then exposes that memory through MCP tools.

It is designed to stay simple:

- one JSON object per durable thing to remember;
- explicit relations instead of tags;
- compact context retrieval instead of loading the whole memory;
- rules stored in Markdown so agents can understand how to mutate memory;
- an optional protected web view for browsing the graph.

The repository is intentionally generic. A new user should be able to deploy it, start with an empty memory, add personal instructions, and let MCP clients build the graph over time.

## Public Repository Checklist

Before publishing or copying this project into a fresh public repository:

- copy the source files, rules, schemas, tests, assets, `README.md`, `EMPTY_BRAIN.md`, `.env.example`, `package.json`, `vercel.json`, and `config.json`;
- do not copy local `.env` files, deployment cache folders, generated logs, or personal memory data from `objects/` and `events/`;
- keep `rules/user_instructions.md` generic unless the repository is intentionally private;
- choose and add a license before calling the repository open source;
- run the checks that fit your workflow before publishing, usually `npm test` and `npm run check`.

This project exposes a remote MCP server through Streamable HTTP:

- main endpoint: `/mcp` or `/api/mcp`
- protocol: JSON-RPC 2.0
- announced MCP version: `2025-06-18`
- runtime: Node.js 20+
- deployment target: Vercel Serverless Functions

## Quick Start

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

On Windows PowerShell, use `npm.cmd install` if script execution policy blocks `npm`.

3. Create a Vercel project from the repository.
4. Add REST KV variables. They are required for a working Vercel deployment:

```text
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

5. Deploy.
6. Open the view URL. If no password is configured yet, AI Second Brain shows the initialization screen.
7. Generate and copy:

```text
BRAIN_VIEW_URL=...
BRAIN_MCP_SECRET=...
BRAIN_VIEW_PASSWORD_HASH=...
```

8. Add these variables to Vercel, redeploy, then sign in.

For a complete blank-instance checklist, see [Starting With An Empty Brain](EMPTY_BRAIN.md).

## MCP Usage

Connect an MCP client to:

```text
https://<project>.vercel.app/api/mcp
```

If `BRAIN_MCP_SECRET` or `MCP_SECRET` is configured, provide the secret with one of:

- `?key=<secret>`
- `?secret=<secret>`
- `x-brain-mcp-secret: <secret>`
- `Authorization: Bearer <secret>`

Recommended first calls for agents:

1. `get_rules`
2. `list_kind_configs`
3. `search` before any mutation
4. `create_object` or focused update tools only after reading the relevant rules

## MCP Tools

The connector exposes these tools:

- `search`
- `read`
- `find_related`
- `build_context_pack`
- `export_nodes_summary`
- `list_due_tasks`
- `get_view_link`
- `read_object_events`
- `get_rules`
- `get_rule`
- `get_user_instructions`
- `set_user_instructions`
- `list_kinds`
- `list_kind_configs`
- `add_kind`
- `update_kind`
- `create_object`
- `set_title`
- `set_kind`
- `set_summary`
- `set_priority`
- `set_deadline`
- `set_completed`
- `update_object`
- `add_content`
- `replace_content`
- `remove_content`
- `create_relation`
- `update_relation`
- `delete_relation`
- `delete_object`
- `delete_object_cascade`
- `archive_object`

`get_rules` reads the structural entry point `rules/README.md` and the customizable `rules/user_instructions.md` file. User instructions are user-specific complements and take priority when they specify or override the expected behavior defined by AI Second Brain's global rules.

`get_rule` reads one focused rule file by name: `editing_rules.md`, `kind.md`, `relations.md`, or `memory_policy.md`.

The structural Markdown files in `rules/`, except `user_instructions.md`, are tracked repository assets and are bundled with the deployment. They carry the strategic framework and are not user-configurable runtime storage. Technical tool usage details, including when to call a tool, which precautions to take, and which fields to provide, are exposed directly through the MCP descriptions and schemas returned by `tools/list`.

`get_user_instructions` reads only `rules/user_instructions.md`.
`set_user_instructions` replaces the entire Markdown file, without targeted editing, with a limit of 32768 UTF-8 bytes. This file stores personal preferences without changing AI Second Brain's structural rules.

`list_kinds` reads kind names from `rules/kinds.json`.
`list_kind_configs` reads kinds with their full visual configuration, including the `{ fill, stroke }` color used for graph nodes and tags.
`add_kind` adds a reusable kind to this registry if absent and associates it with a graph/tag color, either explicitly provided or selected from the palette.
`update_kind` changes the visual configuration of an existing kind, especially its `{ fill, stroke }` color, without changing objects that use it.

`create_object` creates a new node, refuses existing ids, and never merges automatically. It accepts a `relations` field to add outgoing relations in the same call when linked nodes are known:

When a new node explicitly mentions durable linked entities, the agent must handle those linked nodes in the same pass: search for each grounded person, organization, concept, resource, event, or reusable theme; reuse an existing node when present; create a missing node when it deserves independent future retrieval; and link the new node to them. For example, a task to order a gift for someone should search for or create that person, may add a reusable `gift` concept when useful, and should create relations rather than leaving the task isolated.

```json
{
  "title": "Project Alpha",
  "kind": "project",
  "relations": [
    { "to": "obj_ai", "importance": 0.8 }
  ],
  "rules_acknowledged": true
}
```

Each direct relation uses `to` and an optional `importance`. Only one relation can exist between two nodes, regardless of direction. Duplicates already present, in either direction, are not recreated and are returned in `warnings` for grouped additions.

Object updates go through specific tools: `set_title`, `set_kind`, `set_summary`, `set_priority`, `set_deadline`, `set_completed`, `update_object`, `add_content`, `replace_content`, and `remove_content`. The goal is for the agent to choose a clear mutation intent instead of a vague global mutation. Use `update_object` when several metadata fields should change together, or to add outgoing `relations` at the same time as the update. `update_object` may also receive only `relations` when the intent is to add links without touching metadata. Content keeps dedicated tools. `replace_content` should be reserved for cases where the existing node was read immediately beforehand.

Mutation tools also accept `by` for audit history. This field should identify the agent family acting (`Codex`, `ChatGPT`, `Claude`, `Claude Code`, `Cursor`, `Gemini`, `Grok`, `Perplexity`, `Mistral`, `GLM`, etc.) rather than the human user. The history view uses this value to show which agent performed the action.

Relations have no type, label, or action. They only mean that two nodes are linked; the agent must infer meaning from the content and context of both nodes. They can include an `importance`, a number greater than 0 and less than or equal to 1. `1` means an extremely strong relation, `0.5` is applied by default when the value is omitted, and `0` represents no relation and is therefore not stored.

Objects can include `priority`, a number between `0` and `1`, defaulting to `0.5`. It describes the node's own importance. The view also uses it for shape: `0` appears as a round node, `1` as a square node, and intermediate values produce a progressively rounded square.

`search` accepts either `query` or `queries` with several exploratory search strings. It returns matching objects sorted by most recently updated data.

`export_nodes_summary` exports all active nodes in a compact form: `id`, `kind`, `title`, `summary`, `priority`, dates, relation count, and relation targets enriched with title/kind when available. It never includes `content`. The tool accepts `kind` to filter a node type and `include_archived: true` to explicitly include archives.

`list_due_tasks` lists active, unfinished objects with kind `task`, sorted by `dates.deadline_at`, priority, and freshness. It accepts `due_before` to filter tasks due on or before an ISO date or datetime, `include_no_deadline: true` to include tasks without a deadline, and `limit`. When `due_before` is a date only (`YYYY-MM-DD`), the whole day is included.

`get_view_link` returns the AI Second Brain view URL configured by `BRAIN_VIEW_URL` or `config.view_url`. With `{ "id": "obj_xxx" }`, it adds a direct node link through `#node=obj_xxx`.

Objects can store a deadline in `dates.deadline_at`. This value accepts a date only (`YYYY-MM-DD`) or an ISO datetime for a precise deadline. This date complements `priority`: priority indicates importance, while the deadline indicates temporal urgency. Completed objects can store `dates.completed_at`. Archiving a node automatically adds `dates.completed_at` if it does not already exist.

`read_object_events` reads the automatic event log for a node. The store writes this log during mutations (`create_object`, object setters, content tools, `create_relation`, `update_relation`, `delete_relation`, `archive_object`, `delete_object`, `delete_object_cascade`) and requires no action from agents. It is used for audit, debugging, and reconstructing a node's evolution.

`create_relation` remains available for occasional manual relation changes. It creates an explicit link when no link already exists between the same two nodes, regardless of direction. If the link already exists, it does not rewrite the graph and returns `status: "already_exists"` with a `duplicate_relation` warning. `update_relation` changes the target and/or importance of an existing relation identified by `from_id` and `to_id`, then accepts `new_to_id` and/or `importance`. `delete_relation` removes an existing relation that has become false, obsolete, or useless. These mutations are automatically added to the source node's history when they actually change the graph.

When `BRAIN_VIEW_URL` or `config.view_url` is configured, `create_object` returns `view_link` with the direct URL to the view centered on the created node.

`delete_object` is reserved for exceptional cases where a node was created by mistake or with wrong information. It refuses deletion if the node still has outgoing relations or if another node points to it. By default, a useless node should simply be left out of context until it is no longer requested.

`delete_object_cascade` is for exceptional cases where physical deletion is wanted even if the node still has relations. The tool first removes incoming relations from other nodes, logs those removals, then deletes the node and its outgoing relations. It requires a reason and refuses to modify an archived node or a relation carried by an archived node.

`archive_object` is the preferred non-destructive alternative when a node should be corrected, hidden, or removed from normal context without erasing its relations. It adds `dates.archived_at` and completes `dates.completed_at` if needed. Archived objects are excluded from `search`, `build_context_pack`, and default overview nodes. They remain visible in recent activity as removals/archives. They are listed in the view's recent completed nodes only if they had a `dates.deadline_at`. `search` accepts `include_archived: true` to find them explicitly. Once archived, a node is frozen: editing, content, and relation tools refuse to modify it or its links.

## Storage

Locally, the server uses repository folders for runtime memory:

```text
objects/
events/
rules/
```

The `objects/` and `events/` directories are user data, not source code. They are intentionally ignored by git in a public template-style repository.

On Vercel, Redis/KV storage is required. Serverless deployments cannot rely on repository folders for runtime writes, so a Vercel deployment without Redis/KV variables may fail when the app tries to create objects, events, user instructions, or kind configuration.

When Redis/KV is missing on Vercel, the web view shows a setup error with the Upstash Marketplace link instead of a generic 500.

The server automatically switches to REST KV storage when these variables are present:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Direct Upstash names are also accepted:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

The initialization screen includes a direct **Install Upstash Redis on Vercel** link to the Vercel Marketplace. Use it to attach a Redis store to the Vercel project from the browser before using the deployed app. After Vercel adds the Redis environment variables, create a new deployment so the running app can see them.

## Web Setup

The view is protected by default. Without a configured password, it shows an initialization assistant instead of rendering the graph. This screen lets the user choose a password and generates these values in the browser:

- `BRAIN_VIEW_URL`
- `BRAIN_MCP_SECRET`
- `BRAIN_VIEW_PASSWORD_HASH`

Copy these variables into the Vercel environment that matches the URL you are using, then create a new deployment and return to the view to sign in. The password is never stored in plain text.

Expected setup flow:

- No runtime view password: the initialization screen is shown.
- Runtime `BRAIN_VIEW_PASSWORD_HASH`, `BRAIN_VIEW_PASSWORD`, or `VIEW_PASSWORD` present: the login screen is shown.
- Successful login with no stored objects yet: an empty graph is shown.

If the initialization screen still appears after adding variables, the deployed function cannot see a view password variable. Check that `BRAIN_VIEW_PASSWORD_HASH` is saved without quotes or extra spaces, starts with `sha256:`, is assigned to the correct Vercel environment (`Production` for the production URL, `Preview` for preview deployments), and that the deployment you are opening was created after the variables were saved.

Once signed into the view, the `MCP` button shows the MCP URL and the view URL in a pop-up, so they can be recovered if the link is lost.

## Local Development

```bash
npm test
npm run check
npm run dev
```

On Windows PowerShell, use `npm.cmd test`, `npm.cmd run check`, and `npm.cmd run dev`.

Then test:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Vercel Deployment

1. Create a Vercel project from this repository.
2. Configure REST KV variables. This is required for Vercel deployments.
3. Configure `ALLOWED_ORIGINS` with allowed origins separated by commas, for example:

```text
https://chatgpt.com,https://claude.ai
```

4. Deploy.
5. Register the MCP URL client-side:

```text
https://<project>.vercel.app/mcp
```

The passive SSE reconnection guard is disabled by default. To enable it temporarily during an investigation, define:

```text
BRAIN_MCP_SSE_LIMIT_ENABLED=true
```

## Security Notes

The remote HTTP transport must filter the `Origin` header. If `ALLOWED_ORIGINS` is empty, originless calls remain possible for server-to-server clients, but browser calls with `Origin` are rejected.

The MCP can also be protected by `BRAIN_MCP_SECRET` or `MCP_SECRET`. When a secret is configured, every MCP request must provide the same value through `x-brain-mcp-secret`, `Authorization: Bearer ...`, `?key=...`, or `?secret=...`.

The web view is protected by default. Use `BRAIN_VIEW_PASSWORD_HASH` to store a password hash in the environment, or `BRAIN_VIEW_PASSWORD` / `VIEW_PASSWORD` for a simpler plain-text mode. When the password is valid, the page sets an HTTP-only cookie signed with the password hash.

If an intentionally public view is desired, explicitly define:

```text
BRAIN_ALLOW_UNPROTECTED_VIEW=true
```

For a personal instance, prefer environment variables over a committed URL in `config.json`. Example:

```text
BRAIN_VIEW_URL=https://example.vercel.app
```

Never commit real MCP secrets, view passwords, password hashes generated for a private instance, KV tokens, or exported memory data from a personal brain.
