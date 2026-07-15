# Agent Notes

## Communication

- Answer in a short and clear way.
- If you do not know, say so explicitly and do not invent information.

## Code Style

- Always prefer readable code over shortened syntax.
- Keep code simple and easy to maintain.
- Avoid external dependencies whenever possible.
- Avoid duplicated code as much as possible.
- Prefer explicit names that describe intent over abbreviations.
- Use `camelCase` for JavaScript variables and functions, `PascalCase` for classes, and `UPPER_SNAKE_CASE` for constants.
- Use lowercase kebab-case for branch names and lowercase snake_case for BRAIN object ids.

## Windows / PowerShell

- Use `npm.cmd` instead of `npm` when running scripts from PowerShell. The local execution policy can block `npm.ps1` with "running scripts is disabled on this system".
- Prefer `npm.cmd test` and `npm.cmd run check` on Windows when validation is requested.
- Do not start a local development server unless the task explicitly requires runtime verification.

## Git

- Do not work directly on `main` for normal development; create a focused branch and open a pull request.
- Push directly to `main` only when the user explicitly asks for it or when maintaining an existing direct-commit workflow.
- Branch names should be lowercase kebab-case with a clear prefix: `feature/...`, `fix/...`, `docs/...`, `chore/...`, or `refactor/...`.
- Commit messages should be short, imperative, and scoped to one coherent change.
- Pull request titles should use the same short imperative style as commits.
- Pull request descriptions should summarize the change, note verification performed, and call out any skipped tests or known risks.
- Keep changes scoped and commit related edits together.
- Never commit local `.env` files, generated logs, or personal `objects/` and `events/` memory data.

## CSS

- Prefer `inline-block` with explicit widths, margins, and `vertical-align` for compact UI alignment. Avoid `flex` and `grid` unless the layout genuinely needs them.
