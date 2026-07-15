# Empty Brain Onboarding

Use this rule when the memory graph is empty or nearly empty.

An empty brain means there are no useful existing objects to search, reuse, or link. In that case, do not invent starter nodes from assumptions. Ask the user a small set of grounding questions, then create only the nodes supported by their answers.

## When To Trigger

Trigger this onboarding when `search`, `export_nodes_summary`, or the graph view shows no useful active objects.

Also trigger it when the user explicitly says this is a new, blank, or fresh brain.

## Questions To Ask

Ask these questions in one concise message. The user may answer partially; create nodes only from the answered parts.

1. What are the 3 to 5 active projects or responsibilities you want this brain to remember?
2. What near-term tasks or deadlines should be tracked first?
3. Which people, organizations, or teams are important context for those projects?
4. What durable preferences, constraints, or working rules should agents remember?
5. Are there important resources, documents, links, tools, or recurring routines to keep available?

If the user wants a lighter start, ask only:

1. What is the main project or area this brain should remember first?
2. What is the next concrete task related to it?
3. Who or what should be linked to that task?

## Creating The First Nodes

After the user answers:

- Search first even if the graph seems empty, to avoid duplicates if seed data exists.
- Create each grounded project, task, person, organization, preference, resource, or routine as its own object when it is likely to be useful later.
- Add relations in the same pass when the answer clearly links objects.
- Store real deadlines in `deadline_at`, not only in prose.
- Keep uncertain or vague answers out of memory until clarified.
- Prefer a small useful seed graph over a large speculative one.

## Good Starter Shape

A useful first graph often contains:

- one or more `project` nodes;
- one or more `task` nodes linked to those projects;
- important `person` or `organization` nodes linked where relevant;
- durable `preference`, `routine`, or `resource` nodes when the user names them.

Do not create generic starter nodes such as "User", "Work", or "Personal" unless the user gives them concrete meaning.
