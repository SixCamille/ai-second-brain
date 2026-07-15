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
2. Attach a Vercel KV or Upstash Redis database. This is required for a working Vercel deployment.
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

The initialization screen includes an **Install Upstash Redis on Vercel** link. Use it to attach Redis from the browser before using the deployed app, then create a new deployment after Vercel adds the Redis environment variables.

4. Deploy once.
5. Open the deployed view. The initialization screen appears when no view password is configured.
6. Generate and copy the runtime variables shown by the page:

```text
BRAIN_VIEW_URL=...
BRAIN_MCP_SECRET=...
BRAIN_VIEW_PASSWORD_HASH=...
```

7. Add those variables to the same Vercel environment that serves the URL you are opening, then create a new deployment.

After the new deployment starts, opening the view should show the password login screen, not the initialization screen. A fresh or empty memory graph is normal after login. If the initialization screen still appears, the running deployment cannot see any view password variable. Check that `BRAIN_VIEW_PASSWORD_HASH` was added to the right Vercel environment (`Production` for the production URL, `Preview` for preview URLs), that the value starts with `sha256:`, and that the deployment was created after the variable was saved.

When either Redis REST pair is present, AI Second Brain automatically uses Redis/KV for objects, events, user instructions, and mutable kind configuration. Without those variables, only local development should use repository folders for runtime memory.

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

The `objects/` and `events/` folders are optional for a blank local brain. They are created automatically by the file adapter when the server starts locally. On Vercel, objects and events must be stored in REST KV.

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

6. Add them to the deployment environment that matches the URL you are using.
7. Create a new deployment, then reopen the view and sign in.

Expected result:

- Before `BRAIN_VIEW_PASSWORD_HASH` exists at runtime, the view shows the initialization screen.
- After `BRAIN_VIEW_PASSWORD_HASH` exists at runtime, the view shows the login screen.
- After login, an empty graph is expected until objects are created through MCP.

If the initialization screen returns after redeploying, the deployed function still has no configured view password. This is usually caused by adding variables only to `Preview` while opening the production URL, adding them only to `Production` while opening a preview URL, or reopening an older deployment created before the variables existed.

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
