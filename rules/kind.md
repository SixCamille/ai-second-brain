# Kinds

Kinds describe what an object is.

They mainly improve:

- memory readability;
- graph navigation;
- grouping similar objects;
- display behavior such as colors, filters, and views.

A kind never changes an object's meaning. It only describes its category.

## Philosophy

Kinds are not a closed list.

The memory structure is expected to evolve. When a new category becomes relevant, it may be created.

Conversely, prefer reusing an existing kind when it correctly describes the object's nature.

The goal is a clear, stable, reusable structure, not minimizing or maximizing the number of kinds.

## When To Create A Kind

Create a new kind when a category:

- represents a durable concept;
- will probably be reused by several objects;
- improves memory understanding or navigation;
- is not correctly represented by any existing kind.

Before creating one, inspect existing kinds to avoid duplicates or very close categories.

## When Not To Create A Kind

Do not create a kind:

- for a single object;
- for one specific project;
- to work around poor object modeling;
- when an existing kind already describes the category correctly.

If several kinds seem suitable, choose the simplest and most generic one.

## Choose The Right Kind

The kind describes what the object is, not what it contains.

Each object has only one kind.

When unsure, choose the kind that matches the object's main role in memory.

## Evolve Kinds

Kinds can evolve with memory.

When a new family of objects appears regularly, it is better to create a new kind than to keep using an approximate category.

Conversely, avoid multiplying very specialized kinds that will never be reused.

## Visual Configuration

Each kind has a visual configuration, currently a color used by the graph.

This configuration has no impact on object meaning.

It only improves reading and navigation.
