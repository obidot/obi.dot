# Package Context: @obidot/agent

## Dev Environment Tips
- This is an off-chain AI agent built with Node, TypeScript, LangChain, and Viem.
- Run `pnpm install --filter @obidot/agent` to sync dependencies.
- Run the development agent using `pnpm --filter @obidot/agent run dev` (uses `tsx`).

## Testing & Validation Instructions
- Run typechecking: `pnpm --filter @obidot/agent run typecheck` to ensure strict TypeScript compliance.
- Run linting: `pnpm --filter @obidot/agent run lint` (uses ESLint).
- Ensure any changes to LangChain tools or Viem integrations are type-safe.

## PR Instructions
- Branch/Title format: `[@obidot/agent] <Title>`
- Always run typecheck and lint before committing.