# Package: pvm-core (contracts/)

Solidity smart contracts for the Obidot vault system, built with Foundry.

## Build & Test Commands

```sh
forge build                                   # Compile all contracts
forge test                                    # Run full suite (400 tests, 68 suites)
forge test --match-test test_depositBasic -vvv            # Single test, verbose
forge test --match-contract ObidotVault_Deposit_Test      # All tests in one contract
forge test --match-path test/Integration.t.sol            # All tests in one file
forge fmt                                     # Format all .sol files (mandatory)
forge fmt --check                             # Check formatting without modifying

FOUNDRY_PROFILE=ci forge test                 # CI: 5000 fuzz runs, 512 invariant runs
FOUNDRY_PROFILE=polkadot forge build          # PVM build via resolc (no tests)

# Via pnpm (from repo root)
pnpm --filter pvm-core run test:forge         # forge test -vvv
pnpm --filter pvm-core run format             # forge fmt && prettier
```

## Foundry Configuration

- **Solidity:** 0.8.28, optimizer enabled (200 runs), `via_ir = false`
- **Fuzz:** 1000 runs default, 5000 in CI
- **Invariant:** 256 runs / depth 64 default, 512 / 128 in CI
- **Remappings:**
  - `@openzeppelin/contracts/` → `lib/openzeppelin-contracts/contracts/`
  - `@pythnetwork/pyth-sdk-solidity/` → `lib/pyth-sdk-solidity/`
  - `forge-std/` → `lib/forge-std/src/`

## Project Layout

```
contracts/
├── src/
│   ├── ObidotVault.sol         # Core ERC-4626 vault (hub)
│   ├── ObidotVaultEVM.sol      # Satellite vault (EVM chains)
│   ├── KeeperOracle.sol        # Keeper-updatable price feed
│   ├── OracleRegistry.sol      # Multi-asset oracle registry
│   ├── interfaces/             # IAggregatorV3, IXcm, IIsmpHost, IBifrost*
│   ├── adapters/               # CrossChainRouter, BifrostAdapter, HyperbridgeAdapter
│   └── libraries/              # MultiLocation, BifrostCodec, CrossChainCodec
├── test/
│   ├── ObidotVault.t.sol       # Unit + fuzz + invariant tests
│   ├── OracleRegistry.t.sol    # Oracle registry tests
│   ├── CrossChain.t.sol        # Satellite + adapter tests
│   ├── Integration.t.sol       # Full hub lifecycle (7 tests)
│   └── CrossChainLifecycle.t.sol # Cross-chain lifecycle (9 tests)
└── script/
    ├── Deploy.s.sol            # Mainnet deploy + DeployWithSetup
    ├── DeployTestnet.s.sol     # One-shot testnet (token+oracle+vault)
    ├── DeployCrossChain.s.sol  # Router, adapter, satellite deploy
    └── Demo.s.sol              # Full lifecycle demo script
```

## Code Style

### File Structure

Every `.sol` file follows this order:
1. SPDX license identifier
2. Pragma statement
3. Imports — OpenZeppelin first, then local interfaces, then libraries
4. Contract-level NatDoc (`@title`, `@notice`, `@dev`)
5. Body sections separated by `// ─────` bars:
   Constants → Enums/Structs → State → Events → Errors → Constructor → External → Internal

### Naming

- Constants: `UPPER_SNAKE_CASE` — `uint256 internal constant BPS_DENOMINATOR = 10_000;`
- Roles: `bytes32 public constant ROLE_NAME = keccak256("ROLE_NAME");`
- Errors: `error DescriptiveName();` — no require strings
- Events: `event PastTenseVerb(type indexed param);`
- Internal state: `_camelCase` prefix for private/internal variables

### Functions

- Named imports only: `import {Foo} from "...";`
- Modifier order: `visibility` → `override` → `modifier` — e.g. `external override whenNotPaused nonReentrant`
- NatDoc: `@notice` on all public/external; `@dev` for implementation details; `@param` for each parameter
- Custom errors over `require(condition, "string")`

### Testing

- Contract name: `ContractName_Category_Test` (e.g. `ObidotVault_Deposit_Test`)
- Function name: `test_descriptiveName`, `testFuzz_name`, `testRevert_name`
- Base harness: `ObidotVaultTestBase` with shared setUp, helpers, constants
- Mocks: defined in the same test file, `Mock` prefix (e.g. `MockERC20`, `MockOracle`)
- Invariant handlers: `Handler` contracts defined in test file
- Always `vm.warp(10_000)` at start to avoid oracle staleness underflow
- After `vm.warp`, call `oracle.setPrice()` to refresh timestamp
- EIP-712 digests: compute inline in tests (not via `computeIntentDigest`)
- `vm.prank` is consumed by the NEXT external call — cache role hashes first

### Mock Oracle API

```solidity
oracle.setPrice(int256 price)                     // Set price + refresh timestamp
oracle.setStale()                                  // Make 2 hours stale
oracle.setPriceRaw(int256 price, uint256 updatedAt) // Set with explicit timestamp
oracle.setShouldRevert(bool)                        // Force latestRoundData to revert
```

### Key Contract APIs (correct names — not legacy)

```solidity
vault.setParachainAllowed(uint32 parachainId, bool allowed)
vault.setProtocolAllowed(address protocol, bool allowed)
vault.setProtocolExposureCap(address protocol, uint256 cap)
// Constructor: _maxRefTime and _maxProofSize are uint64, not uint256
// IXcm.send() returns void, not bool
```

## PR Instructions

- Branch/title format: `[pvm-core] <Title>`
- Run `forge test` and `forge fmt` before committing — all tests must pass
