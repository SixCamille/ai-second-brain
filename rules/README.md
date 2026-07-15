# Second Brain Rules

These files describe the principles used to build, organize, and evolve the memory graph.

The MCP exposes this entry point through `get_rules` so an agent can orient itself before reading detailed rule files.

`get_rules` intentionally returns only this `README.md` entry point plus `user_instructions.md`. It does not return the detailed rule files listed below.

Before any mutation, the agent must read the detailed rule files that apply to the intended change by calling `get_rule` with each specific file name. For ordinary object creation or updates, this usually includes `editing_rules.md` and `memory_policy.md`; use `kind.md` for kind decisions and `relations.md` for graph links.

Detailed tool descriptions are exposed directly by the MCP. These files explain **why** and **when** to act, not **how to call** each tool.

- `editing_rules.md`: object creation, update, consolidation, and organization principles.
- `kind.md`: kind philosophy and rules for creating new categories.
- `relations.md`: principles for creating and managing relations between objects.
- `memory_policy.md`: criteria for deciding which information deserves to be stored.
