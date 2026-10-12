# Lumen Verification Checklist

Run the smallest meaningful checks for the change.

## For TypeScript / Next.js Changes

- `pnpm --filter @lumen/vacancy type-check` when touching the current MVP shell.
- `pnpm --filter @lumen/vacancy build` before handing back substantial UI or route changes.
- Use equivalent app filters for `@lumen/space` and `@lumen/pipeline` when touching those apps.

## For Shared Packages

- Run the package's type-check script if present.
- Run every app build that imports the changed package when the API changed.
- Update docs or examples when exported behavior changes.

## For Frontend Changes

- Render the changed surface locally.
- Confirm the first meaningful screen is not blank.
- Check no framework error overlay appears.
- Exercise at least one relevant interaction.
- Check desktop and one mobile-sized viewport.
- Look specifically for text clipping, horizontal overflow, unreadable controls, and stale loading states.

## For Product/Trust Changes

- Confirm public-interest boundary remains visible where relevant.
- Confirm no new workflow enables buyer targeting, resident pressure, or speculative lead generation.
- Confirm source, confidence, and limitation language remains attached to visible opportunity signals.

## Final Handoff

Report:

- files or surfaces changed
- commands/checks run
- failures or environment limitations
- known remaining risk
