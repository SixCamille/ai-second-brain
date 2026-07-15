# Starting With An Empty AI Second Brain

Use this guide when creating a fresh AI Second Brain instance with no existing `objects/` or cloud KV data.

## Files To Copy Into A Fresh Repository

For a clean public or reusable starter repository, copy the application source and generic configuration only:

- `api/`
- `src/`
- `rules/`
- `schemas/`
- `tests/`
- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `config.json`
- `package.json`
- `vercel.json`
- `README.md`
- `EMPTY_BRAIN.md`

Do not copy local `.env` files, `.vercel/`, `node_modules/`, generated logs, `objects/`, or `events/`.

`vercel.json` is part of the source to copy. It carries the Vercel routing and function settings for `/`, `/mcp`, `/health`, static assets, and bundled rule files. The Vercel project link itself (`.vercel/`) is local machine state and should be recreated by Vercel for the new repository.

Redis/KV credentials are not copied as files. They are deployment environment variables and must be configured again in the new Vercel project.

## Vercel And Redis Setup

For a fresh Vercel deployment:

1. Import or create the new Git repository in Vercel.
2. Attach a Vercel KV or Upstash Redis database if persistent cloud memory is needed.
3. Add one supported Redis REST variable pair to the Vercel environment:

```text
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

or:

```text
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

4. Deploy once.
5. Open the deployed view. The initialization screen appears when no view password is configured.
6. Generate and copy the runtime variables shown by the page:

```text
BRAIN_VIEW_URL=...
BRAIN_MCP_SECRET=...
BRAIN_VIEW_PASSWORD_HASH=...
```

7. Add those variables to Vercel, then redeploy.

When either Redis REST pair is present, AI Second Brain automatically uses Redis/KV for objects, events, user instructions, and mutable kind configuration. Without those variables, local development falls back to repository folders for runtime memory.

## What A Fresh Instance Contains

A new instance can start with only:

- `rules/README.md`
- `rules/editing_rules.md`
- `rules/kind.md`
- `rules/relations.md`
- `rules/memory_policy.md`
- `rules/user_instructions.md`
- `rules/kinds.json`
- `config.json`

The `objects/` and `events/` folders are optional for a blank local brain. They are created automatically by the file adapter when the server starts locally. On Vercel, persistent objects and events are stored in REST KV when KV environment variables are configured.

If you copy an existing private instance, check that `rules/user_instructions.md` does not contain personal preferences before publishing it.

## First Launch

1. Deploy the project or run it locally.
2. Open the web view.
3. If no view password is configured, the initialization screen appears instead of the graph.
4. Enter the public view URL and a new view password.
5. Copy the generated environment variables:

```text
BRAIN_VIEW_URL=...
BRAIN_MCP_SECRET=...
BRAIN_VIEW_PASSWORD_HASH=...
```

6. Add them to the deployment environment.
7. Redeploy, then reopen the view and sign in.

## Connect An MCP Client

Use the MCP URL shown by the initialization screen or by the `MCP` button in the signed-in view:

```text
https://<project>.vercel.app/api/mcp?key=<BRAIN_MCP_SECRET>
```

The secret can also be passed with `x-brain-mcp-secret` or `Authorization: Bearer ...`.

## Add Personal Instructions

Keep structural rules reusable for everyone. Put personal preferences in `rules/user_instructions.md` or update them through the MCP tool:

```text
set_user_instructions
```

Agents receive these instructions through `get_rules`, alongside the structural entry point.

## Create The First Nodes

Start by creating durable, reusable context:

- long-running projects;
- active tasks with real deadlines;
- recurring routines;
- important people or organizations;
- durable preferences;
- resources that will be referenced again.

Before creating a node, search first. When a new node mentions durable linked entities, search for or create those linked nodes in the same pass and add relations immediately.
