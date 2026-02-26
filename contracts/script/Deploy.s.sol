// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ObidotVault} from "../src/ObidotVault.sol";

/// @title Deploy — ObidotVault deployment script for Polkadot Hub Testnet (Paseo)
/// @notice Broadcasts a single transaction deploying the ObidotVault contract
///         with constructor arguments sourced from environment variables.
/// @dev Usage:
///
///   # 1. Install the nightly toolchain for Polkadot network support
///   foundryup --nightly
///
///   # 2. Set required environment variables
///   export PRIVATE_KEY=<deployer-private-key>
///   export UNDERLYING_ASSET=<erc20-address>
///   export PYTH_ORACLE=<pyth-aggregator-v3-address>
///   export ADMIN_ADDRESS=<admin-multisig-or-eoa>
///
///   # 3. Optional overrides (defaults shown)
///   export DEPOSIT_CAP=1000000000000000000000000   # 1M tokens (18 decimals)
///   export MAX_DAILY_LOSS=50000000000000000000000   # 50K tokens
///   export MAX_XCM_REF_TIME=1000000000000           # 1T picoseconds
///   export MAX_XCM_PROOF_SIZE=1048576               # 1 MB
///
///   # 4. Deploy to Polkadot Hub Testnet
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url polkadot_hub_testnet \
///     --broadcast \
///     --verify \
///     -vvvv
///
///   # 5. Deploy to local node
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url local \
///     --broadcast \
///     -vvvv
contract Deploy is Script {
    // ─────────────────────────────────────────────────────────────────────
    //  Default Configuration
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Default deposit cap: 1,000,000 tokens (assumes 18 decimals).
    uint256 internal constant DEFAULT_DEPOSIT_CAP = 1_000_000 ether;

    /// @dev Default max daily loss: 50,000 tokens.
    uint256 internal constant DEFAULT_MAX_DAILY_LOSS = 50_000 ether;

    /// @dev Default max XCM refTime: 1 trillion picoseconds (1 second).
    uint64 internal constant DEFAULT_MAX_XCM_REF_TIME = 1_000_000_000_000;

    /// @dev Default max XCM proofSize: 1 MB.
    uint64 internal constant DEFAULT_MAX_XCM_PROOF_SIZE = 1_048_576;

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    error MissingEnvVar(string name);

    // ─────────────────────────────────────────────────────────────────────
    //  Script Entry Point
    // ─────────────────────────────────────────────────────────────────────

    function run() external {
        // ── Load required environment variables ──────────────────────────
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address underlyingAsset = vm.envAddress("UNDERLYING_ASSET");
        address pythOracle = vm.envAddress("PYTH_ORACLE");
        address admin = vm.envAddress("ADMIN_ADDRESS");

        // ── Load optional overrides with defaults ────────────────────────
        uint256 depositCap = vm.envOr("DEPOSIT_CAP", DEFAULT_DEPOSIT_CAP);
        uint256 maxDailyLoss = vm.envOr("MAX_DAILY_LOSS", DEFAULT_MAX_DAILY_LOSS);
        uint64 maxRefTime = uint64(vm.envOr("MAX_XCM_REF_TIME", uint256(DEFAULT_MAX_XCM_REF_TIME)));
        uint64 maxProofSize = uint64(vm.envOr("MAX_XCM_PROOF_SIZE", uint256(DEFAULT_MAX_XCM_PROOF_SIZE)));

        // ── Log deployment parameters ────────────────────────────────────
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== ObidotVault Deployment ===");
        console.log("Chain ID        :", block.chainid);
        console.log("Deployer        :", deployer);
        console.log("Admin           :", admin);
        console.log("Underlying Asset:", underlyingAsset);
        console.log("Pyth Oracle     :", pythOracle);
        console.log("Deposit Cap     :", depositCap);
        console.log("Max Daily Loss  :", maxDailyLoss);
        console.log("Max XCM RefTime :", uint256(maxRefTime));
        console.log("Max XCM Proof   :", uint256(maxProofSize));
        console.log("==============================");

        // ── Deploy ───────────────────────────────────────────────────────
        vm.startBroadcast(deployerPrivateKey);

        ObidotVault vault = new ObidotVault(
            IERC20(underlyingAsset), pythOracle, depositCap, maxDailyLoss, maxRefTime, maxProofSize, admin
        );

        console.log("ObidotVault deployed at:", address(vault));
        console.log("Vault share token name :", vault.name());
        console.log("Vault share symbol     :", vault.symbol());
        console.log("Domain separator       :", vm.toString(vault.DOMAIN_SEPARATOR()));

        vm.stopBroadcast();

        // ── Post-deploy verification ─────────────────────────────────────
        _verify(vault, underlyingAsset, pythOracle, admin, depositCap, maxDailyLoss, maxRefTime, maxProofSize);

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Next steps:");
        console.log("  1. Grant STRATEGIST_ROLE to AI agent address");
        console.log("  2. Configure allowed parachains via setParachainAllowed()");
        console.log("  3. Configure allowed protocols via setProtocolAllowed()");
        console.log("  4. Set protocol exposure caps via setProtocolExposureCap()");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Post-Deploy Verification
    // ─────────────────────────────────────────────────────────────────────

    function _verify(
        ObidotVault vault,
        address underlyingAsset,
        address pythOracle,
        address admin,
        uint256 depositCap,
        uint256 maxDailyLoss,
        uint64 maxRefTime,
        uint64 maxProofSize
    ) internal view {
        require(vault.asset() == underlyingAsset, "Asset mismatch");
        require(address(vault.priceOracle()) == pythOracle, "Oracle mismatch");
        require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin), "Admin role not set");
        require(vault.hasRole(vault.KEEPER_ROLE(), admin), "Keeper role not set");
        require(vault.depositCap() == depositCap, "Deposit cap mismatch");
        require(vault.maxDailyLoss() == maxDailyLoss, "Max daily loss mismatch");
        require(vault.maxXcmRefTime() == maxRefTime, "XCM refTime mismatch");
        require(vault.maxXcmProofSize() == maxProofSize, "XCM proofSize mismatch");
        require(vault.totalAssets() == 0, "Total assets should be zero");
        require(vault.totalSupply() == 0, "Total supply should be zero");
        require(!vault.paused(), "Vault should not be paused");
        require(!vault.emergencyMode(), "Emergency mode should be off");

        console.log("Post-deploy verification: ALL CHECKS PASSED");
    }
}

/// @title DeployWithSetup — Extended deployment that also configures initial policy
/// @notice Deploys the vault AND sets up initial parachains, protocols, and a strategist.
/// @dev Usage:
///
///   export PRIVATE_KEY=<deployer-private-key>
///   export UNDERLYING_ASSET=<erc20-address>
///   export PYTH_ORACLE=<pyth-aggregator-v3-address>
///   export ADMIN_ADDRESS=<admin-address>
///   export STRATEGIST_ADDRESS=<ai-agent-address>
///
///   forge script script/Deploy.s.sol:DeployWithSetup \
///     --rpc-url polkadot_hub_testnet \
///     --broadcast \
///     -vvvv
contract DeployWithSetup is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address underlyingAsset = vm.envAddress("UNDERLYING_ASSET");
        address pythOracle = vm.envAddress("PYTH_ORACLE");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address strategist = vm.envAddress("STRATEGIST_ADDRESS");

        uint256 depositCap = vm.envOr("DEPOSIT_CAP", uint256(1_000_000 ether));
        uint256 maxDailyLoss = vm.envOr("MAX_DAILY_LOSS", uint256(50_000 ether));
        uint64 maxRefTime = uint64(vm.envOr("MAX_XCM_REF_TIME", uint256(1_000_000_000_000)));
        uint64 maxProofSize = uint64(vm.envOr("MAX_XCM_PROOF_SIZE", uint256(1_048_576)));

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. Deploy Vault ──────────────────────────────────────────────
        ObidotVault vault = new ObidotVault(
            IERC20(underlyingAsset), pythOracle, depositCap, maxDailyLoss, maxRefTime, maxProofSize, admin
        );

        console.log("ObidotVault deployed at:", address(vault));

        // ── 2. Grant Strategist Role ─────────────────────────────────────
        vault.grantRole(vault.STRATEGIST_ROLE(), strategist);
        console.log("STRATEGIST_ROLE granted to:", strategist);

        // ── 3. Configure Allowed Parachains ──────────────────────────────
        // Astar (2006), Moonbeam (2004), Acala (2000), HydraDX (2034), Bifrost (2030)
        uint32[5] memory parachains = [
            uint32(2006), // Astar
            uint32(2004), // Moonbeam
            uint32(2000), // Acala
            uint32(2034), // HydraDX
            uint32(2030) // Bifrost
        ];

        for (uint256 i = 0; i < parachains.length; i++) {
            vault.setParachainAllowed(parachains[i], true);
            console.log("  Parachain allowed:", uint256(parachains[i]));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment + Setup Complete ===");
        console.log("Remaining manual steps:");
        console.log("  1. Call setProtocolAllowed() for each target DeFi protocol");
        console.log("  2. Call setProtocolExposureCap() for each protocol");
        console.log("  3. Transfer DEFAULT_ADMIN_ROLE to multisig if needed");
    }
}
