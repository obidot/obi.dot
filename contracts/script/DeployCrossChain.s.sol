// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CrossChainRouter} from "../src/adapters/CrossChainRouter.sol";
import {BifrostAdapter} from "../src/adapters/BifrostAdapter.sol";
import {ObidotVault} from "../src/ObidotVault.sol";

/// @title DeployCrossChain — Deploy CrossChainRouter + BifrostAdapter on Polkadot Hub
/// @notice Deploys the hub-side cross-chain infrastructure alongside (or after) the
///         main ObidotVault. Configures the router as the vault's cross-chain router
///         and the BifrostAdapter as its Bifrost adapter.
/// @dev Usage:
///
///   export PRIVATE_KEY=<deployer-private-key>
///   export UNDERLYING_ASSET=<erc20-address>
///   export ISMP_HOST=<hyperbridge-ismp-host-on-polkadot-hub>
///   export MASTER_VAULT=<obidot-vault-address>
///   export ADMIN_ADDRESS=<admin-multisig-or-eoa>
///
///   forge script script/DeployCrossChain.s.sol:DeployCrossChain \
///     --rpc-url polkadot_hub_testnet \
///     --broadcast \
///     -vvvv
contract DeployCrossChain is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address underlyingAsset = vm.envAddress("UNDERLYING_ASSET");
        address ismpHost = vm.envAddress("ISMP_HOST");
        address masterVault = vm.envAddress("MASTER_VAULT");
        address admin = vm.envAddress("ADMIN_ADDRESS");

        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Cross-Chain Hub Deployment ===");
        console.log("Chain ID       :", block.chainid);
        console.log("Deployer       :", deployer);
        console.log("Admin          :", admin);
        console.log("ISMP Host      :", ismpHost);
        console.log("Master Vault   :", masterVault);
        console.log("Underlying     :", underlyingAsset);
        console.log("=================================");

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. Deploy CrossChainRouter ───────────────────────────────────
        CrossChainRouter router = new CrossChainRouter(ismpHost, IERC20(underlyingAsset), masterVault, admin);
        console.log("CrossChainRouter deployed at:", address(router));

        // ── 2. Deploy BifrostAdapter ─────────────────────────────────────
        BifrostAdapter bifrostAdapter = new BifrostAdapter(admin, masterVault);
        console.log("BifrostAdapter deployed at  :", address(bifrostAdapter));

        // ── 3. Configure ObidotVault with cross-chain components ─────────
        ObidotVault vault = ObidotVault(payable(masterVault));

        // These calls require the deployer to have DEFAULT_ADMIN_ROLE on the vault
        // If deployer != admin, these will revert and need to be done by admin separately
        try vault.setCrossChainRouter(address(router)) {
            console.log("Vault crossChainRouter set  :", address(router));
        } catch {
            console.log("WARN: Could not set crossChainRouter (deployer may not have admin role)");
        }
        try vault.setBifrostAdapter(address(bifrostAdapter)) {
            console.log("Vault bifrostAdapter set    :", address(bifrostAdapter));
        } catch {
            console.log("WARN: Could not set bifrostAdapter (deployer may not have admin role)");
        }
        // ── 4. Ensure Bifrost parachain is whitelisted ───────────────────
        try vault.setParachainAllowed(2030, true) {
            console.log("Bifrost (2030) whitelisted");
        } catch {
            console.log("WARN: Could not whitelist Bifrost parachain");
        }
        vm.stopBroadcast();

        // ── Post-deploy verification ─────────────────────────────────────
        _verify(router, bifrostAdapter, underlyingAsset, ismpHost, masterVault, admin);

        console.log("");
        console.log("=== Hub Cross-Chain Deployment Complete ===");
        console.log("Next steps:");
        console.log("  1. Register satellite chains via router.addSatelliteChain()");
        console.log("  2. Deploy ObidotVaultEVM on each target EVM chain");
        console.log("  3. Register peers bidirectionally between router and satellites");
        console.log("  4. Fund router with native tokens for ISMP dispatch fees");
    }

    function _verify(
        CrossChainRouter router,
        BifrostAdapter bifrostAdapter,
        address underlyingAsset,
        address ismpHost,
        address masterVault,
        address admin
    ) internal view {
        require(address(router.asset()) == underlyingAsset, "Router: asset mismatch");
        require(address(router.ismpHost()) == ismpHost, "Router: ISMP host mismatch");
        require(router.masterVault() == masterVault, "Router: master vault mismatch");
        require(router.hasRole(router.DEFAULT_ADMIN_ROLE(), admin), "Router: admin role missing");
        require(router.hasRole(router.VAULT_ROLE(), masterVault), "Router: vault role missing");
        require(!router.paused(), "Router: should not be paused");

        require(
            bifrostAdapter.hasRole(bifrostAdapter.DEFAULT_ADMIN_ROLE(), admin), "BifrostAdapter: admin role missing"
        );
        require(
            bifrostAdapter.hasRole(bifrostAdapter.STRATEGY_EXECUTOR_ROLE(), masterVault),
            "BifrostAdapter: vault executor role missing"
        );

        console.log("Post-deploy verification: ALL CHECKS PASSED");
    }
}

/// @title DeploySatelliteVault — Deploy ObidotVaultEVM on an EVM chain (Ethereum, L2s)
/// @notice Deploys a satellite vault on Ethereum, Arbitrum, Optimism, Base, or other
///         EVM chains. The satellite connects to the hub via Hyperbridge ISMP.
/// @dev Usage:
///
///   export PRIVATE_KEY=<deployer-private-key>
///   export UNDERLYING_ASSET=<erc20-address-on-target-chain>
///   export ISMP_HOST=<hyperbridge-ismp-host-on-target-chain>
///   export HUB_CHAIN_ID="POLKADOT-HUB"
///   export HUB_ROUTER_MODULE=<abi-encoded-router-address-on-hub>
///   export CHAIN_IDENTIFIER="ETHEREUM"   # or "ARBITRUM", "OPTIMISM", "BASE"
///   export DEPOSIT_CAP=1000000000000000000000000
///   export MAX_SYNC_AGE=3600
///   export ADMIN_ADDRESS=<admin-multisig-or-eoa>
///
///   forge script script/DeployCrossChain.s.sol:DeploySatelliteVault \
///     --rpc-url <target-rpc> \
///     --broadcast \
///     --verify \
///     -vvvv
contract DeploySatelliteVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address underlyingAsset = vm.envAddress("UNDERLYING_ASSET");
        address ismpHost = vm.envAddress("ISMP_HOST");
        string memory hubChainIdStr = vm.envOr("HUB_CHAIN_ID", string("POLKADOT-HUB"));
        bytes memory hubRouterModule = vm.envBytes("HUB_ROUTER_MODULE");
        string memory chainIdStr = vm.envString("CHAIN_IDENTIFIER");
        uint256 depositCap = vm.envOr("DEPOSIT_CAP", uint256(1_000_000 ether));
        uint256 maxSyncAge = vm.envOr("MAX_SYNC_AGE", uint256(3600));
        address admin = vm.envAddress("ADMIN_ADDRESS");

        bytes memory hubChainId = bytes(hubChainIdStr);
        bytes memory chainIdentifier = bytes(chainIdStr);
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Satellite Vault Deployment ===");
        console.log("Chain ID          :", block.chainid);
        console.log("Chain Identifier  :", chainIdStr);
        console.log("Deployer          :", deployer);
        console.log("Admin             :", admin);
        console.log("ISMP Host         :", ismpHost);
        console.log("Hub Chain ID      :", hubChainIdStr);
        console.log("Underlying Asset  :", underlyingAsset);
        console.log("Deposit Cap       :", depositCap);
        console.log("Max Sync Age      :", maxSyncAge);
        console.log("==================================");

        vm.startBroadcast(deployerPrivateKey);

        ObidotVaultEVM satellite = new ObidotVaultEVM(
            IERC20(underlyingAsset),
            ismpHost,
            hubChainId,
            hubRouterModule,
            chainIdentifier,
            depositCap,
            maxSyncAge,
            admin
        );

        console.log("ObidotVaultEVM deployed at:", address(satellite));
        console.log("Share token name          :", satellite.name());
        console.log("Share token symbol        :", satellite.symbol());

        vm.stopBroadcast();

        // ── Verification ─────────────────────────────────────────────────
        require(satellite.asset() == underlyingAsset, "Asset mismatch");
        require(address(satellite.ismpHost()) == ismpHost, "ISMP host mismatch");
        require(satellite.depositCap() == depositCap, "Deposit cap mismatch");
        require(satellite.maxSyncAge() == maxSyncAge, "Max sync age mismatch");
        require(satellite.hasRole(satellite.DEFAULT_ADMIN_ROLE(), admin), "Admin role missing");
        require(!satellite.paused(), "Should not be paused");
        require(!satellite.emergencyMode(), "Emergency mode should be off");

        console.log("Post-deploy verification: ALL CHECKS PASSED");
        console.log("");
        console.log("=== Satellite Deployment Complete ===");
        console.log("Next steps:");
        console.log("  1. On the hub, call router.addSatelliteChain() with this chain's ID and vault address");
        console.log("  2. Fund this contract with native tokens for ISMP dispatch fees");
        console.log("  3. Approve underlying asset for deposits");
    }
}

import {ObidotVaultEVM} from "../src/ObidotVaultEVM.sol";

/// @title RegisterSatellitePeers — Post-deployment peer registration script
/// @notice After deploying both hub and satellite infrastructure, run this script
///         on the hub chain to register all satellite vaults as peers in the router.
/// @dev Usage:
///
///   export PRIVATE_KEY=<admin-private-key>
///   export ROUTER_ADDRESS=<cross-chain-router-address-on-hub>
///   export SATELLITE_CHAIN_IDS="ETHEREUM,ARBITRUM,OPTIMISM"
///   export SATELLITE_MODULES="0x...,0x...,0x..."   # abi.encode(address) for each
///
///   forge script script/DeployCrossChain.s.sol:RegisterSatellitePeers \
///     --rpc-url polkadot_hub_testnet \
///     --broadcast \
///     -vvvv
contract RegisterSatellitePeers is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address routerAddress = vm.envAddress("ROUTER_ADDRESS");

        // Comma-separated lists
        string memory chainIdsRaw = vm.envString("SATELLITE_CHAIN_IDS");
        string memory modulesRaw = vm.envString("SATELLITE_MODULES");

        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Register Satellite Peers ===");
        console.log("Router     :", routerAddress);
        console.log("Deployer   :", deployer);
        console.log("Chain IDs  :", chainIdsRaw);
        console.log("================================");

        CrossChainRouter router = CrossChainRouter(payable(routerAddress));

        vm.startBroadcast(deployerPrivateKey);

        // Parse and register (simplified — in production use proper string splitting)
        // For now, register from env vars individually
        string memory ethChainId = vm.envOr("ETH_CHAIN_ID", string("ETHEREUM"));
        address ethModule = vm.envOr("ETH_SATELLITE_MODULE", address(0));

        if (ethModule != address(0)) {
            router.addSatelliteChain(bytes(ethChainId), abi.encode(ethModule));
            console.log("Registered satellite:", ethChainId, "->", ethModule);
        }

        string memory arbChainId = vm.envOr("ARB_CHAIN_ID", string("ARBITRUM"));
        address arbModule = vm.envOr("ARB_SATELLITE_MODULE", address(0));

        if (arbModule != address(0)) {
            router.addSatelliteChain(bytes(arbChainId), abi.encode(arbModule));
            console.log("Registered satellite:", arbChainId, "->", arbModule);
        }

        string memory opChainId = vm.envOr("OP_CHAIN_ID", string("OPTIMISM"));
        address opModule = vm.envOr("OP_SATELLITE_MODULE", address(0));

        if (opModule != address(0)) {
            router.addSatelliteChain(bytes(opChainId), abi.encode(opModule));
            console.log("Registered satellite:", opChainId, "->", opModule);
        }

        string memory baseChainId = vm.envOr("BASE_CHAIN_ID", string("BASE"));
        address baseModule = vm.envOr("BASE_SATELLITE_MODULE", address(0));

        if (baseModule != address(0)) {
            router.addSatelliteChain(bytes(baseChainId), abi.encode(baseModule));
            console.log("Registered satellite:", baseChainId, "->", baseModule);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("Satellite chain count:", router.satelliteChainCount());
        console.log("=== Peer Registration Complete ===");
    }
}
