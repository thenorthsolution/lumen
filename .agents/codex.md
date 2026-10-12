# Codex Working Rules

## Working Style

- Read the relevant code before changing it.
- Prefer the existing architecture and local patterns over new abstractions.
- Keep changes narrow unless the task explicitly asks for a broader redesign.
- Write code that a careful engineer can understand without reverse-engineering intent.
- Do not hide product or data limitations behind optimistic copy.

## Editing Rules

- Use TypeScript types deliberately; avoid `any` unless there is a clear boundary reason.
- Keep components small enough to review, but do not split purely for aesthetics.
- Avoid clever utility layers for one-off behavior.
- Prefer structured parsing and typed helpers over ad hoc string manipulation.
- Add comments only where they explain non-obvious reasoning, not what the code literally does.

## Git And Workspace

- The working tree may contain user changes. Do not revert unrelated files.
- Check `git status --short` before and after substantial work.
- Do not run destructive commands unless the user explicitly asked for them.
- Generated files should be updated only when the task requires them.

## Communication

- Be direct and factual.
- State assumptions when they affect implementation.
- Report what changed, what was verified, and what remains uncertain.
- If something fails because of environment constraints, say so plainly and continue with the safest fallback.
