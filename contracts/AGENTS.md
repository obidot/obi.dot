# Package Context: pvm-core

## Dev Environment Tips
- This is a Solidity smart contract environment using Foundry and Hardhat.
- Run `pnpm install --filter pvm-core` to sync Node dependencies.
- Compile contracts using `pnpm --filter pvm-core run compile:forge`.

## Testing Instructions
- Run the full Forge test suite: `pnpm --filter pvm-core run test:forge`
- To focus on a specific test: `cd contracts && forge test --match-test <test_name> -vvv`
- For Polkadot specific testing: `pnpm --filter pvm-core run test:forge:polkadot`
- Fix any compilation or test errors until the suite is green.
- Run `pnpm --filter pvm-core run format` (`forge fmt` & `prettier`) after making changes.

## PR Instructions
- Branch/Title format: `[pvm-core] <Title>`
- Always ensure tests pass and contracts compile cleanly before committing.