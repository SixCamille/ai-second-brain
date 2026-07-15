# Editing Rules

These rules describe how to enrich and maintain memory. They complement the tool descriptions, which already explain tool usage and parameters.

## Goal

Memory represents durable information, organized as objects connected by relations.

Every mutation should improve this memory without losing information, creating duplicates, or making the graph unnecessarily complex.

## Preserve Memory

Search existing objects before any mutation.

When several phrasings are plausible, run exploratory searches to reduce duplicates.

If an object already exists, enrich it when the meaning remains the same instead of creating a new object.

Before any change that may replace or remove information, read the object again so its content is preserved.

Prefer archiving when information should disappear from the current context but still has historical value.

## Create New Objects

Information deserves a dedicated object when it has its own identity and can reasonably be found independently in the future.

Conversely, a one-off or purely contextual detail should usually be added to an existing object's content.

Finding an existing object does not always mean no creation is needed.

The same piece of information can lead to:

- enriching an existing object;
- creating one or more new durable entities;
- creating new relations between these objects.

When several durable entities appear in the same information, consider them independently. They may evolve separately and deserve their own objects.

Creating a node requires handling its obvious linked nodes in the same pass. If a new task, project, decision, resource, or other object explicitly mentions a durable person, organization, concept, resource, event, or reusable theme, the agent must search for each one, reuse it if it exists, or create it if it is missing and durable enough to be found independently later.

Do not leave an added node isolated when the information itself names grounded linked entities. For example, a task to order a gift for someone should search for or create that person, may create a reusable `gift` concept when useful, and should link the task to those nodes.

## Organize The Graph

Relations only represent that a link exists between two objects.

After an important creation or update, look for relations that naturally make the graph more coherent.

An object may remain isolated when that matches its state: new information, insufficient context, or an uncertain link.

Avoid isolated objects when a logical link can be established without inventing information, but do not force a relation just to complete the graph.

An object's content describes that object.

Graph organization information should be represented through relations or metadata, not through content.

## Kinds

Kinds describe the nature of objects.

Their use and evolution are defined in `kind.md`.

## Memory Quality

Keep only durable information or information likely to be useful in the future.

Avoid temporary or anecdotal information, and public facts that do not have specific value for the user.

Do not invent information to make the graph more complete.

## General Principle

With every mutation, try to improve:

- object quality;
- relation quality;
- the overall organization of memory.

Memory should be able to keep evolving naturally without requiring major reorganization.
