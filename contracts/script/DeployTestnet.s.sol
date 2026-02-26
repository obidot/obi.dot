// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ObidotVault} from "../src/ObidotVault.sol";
import {KeeperOracle} from "../src/KeeperOracle.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";

// ─────────────────────────────────────────────────────────────────────────
//  Deployable Test Token
// ─────────────────────────────────────────────────────────────────────────

/// @title TestDOT — Mintable ERC-20 for testnet use
/// @notice Anyone can mint tokens. DO NOT use in production.
contract TestDOT is ERC20 {
    constructor() ERC20("Test DOT", "tDOT") {}

    /// @notice Mint tokens to any address (permissionless for testnet).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Deploy Script
// ─────────────────────────────────────────────────────────────────────────

/// @title DeployTestnet — One-shot testnet deployment (token + oracle + vault)
/// @notice Deploys a mock ERC-20 token, a KeeperOracle, and the ObidotVault
///         in a single broadcast. Use this when deploying to a chain that
///         lacks native ERC-20 tokens and Pyth oracle (e.g. Polkadot Hub Testnet).
///
/// @dev Usage:
///
///   export PRIVATE_KEY=<deployer-private-key>
///
///   # Optional overrides
///   export ADMIN_ADDRESS=<admin-address>           # defaults to deployer
///   export INITIAL_PRICE=700000000                  # DOT/USD = $7.00 (8 decimals)
///   export DEPOSIT_CAP=1000000000000000000000000    # 1M tokens (18 decimals)
///   export MAX_DAILY_LOSS=50000000000000000000000   # 50K tokens
///   export MINT_AMOUNT=100000000000000000000000     # 100K tDOT to deployer
///
///   forge script script/DeployTestnet.s.sol:DeployTestnet \
///     --rpc-url polkadot_hub_testnet \
///     --broadcast \
///     -vvvv
contract DeployTestnet is Script {
    struct DeployConfig {
        address admin;
        int256 initialPrice;
        uint256 depositCap;
        uint256 maxDailyLoss;
        uint64 maxRefTime;
        uint64 maxProofSize;
        uint256 mintAmount;
    }

    function _loadConfig(address deployer) internal view returns (DeployConfig memory cfg) {
        cfg.admin = vm.envOr("ADMIN_ADDRESS", deployer);
        cfg.initialPrice = int256(vm.envOr("INITIAL_PRICE", uint256(700_000_000)));
        cfg.depositCap = vm.envOr("DEPOSIT_CAP", uint256(1_000_000 ether));
        cfg.maxDailyLoss = vm.envOr("MAX_DAILY_LOSS", uint256(50_000 ether));
        cfg.maxRefTime = uint64(vm.envOr("MAX_XCM_REF_TIME", uint256(1_000_000_000_000)));
        cfg.maxProofSize = uint64(vm.envOr("MAX_XCM_PROOF_SIZE", uint256(1_048_576)));
        cfg.mintAmount = vm.envOr("MINT_AMOUNT", uint256(100_000 ether));
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        DeployConfig memory cfg = _loadConfig(deployer);

        console.log("=== Testnet Full Deployment ===");
        console.log("Chain ID       :", block.chainid);
        console.log("Deployer       :", deployer);
        console.log("Admin          :", cfg.admin);
        console.log("Initial Price  :", uint256(cfg.initialPrice), "(8 dec)");
        console.log("Deposit Cap    :", cfg.depositCap);
        console.log("Mint Amount    :", cfg.mintAmount);
        console.log("================================");

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. Deploy Test Token ─────────────────────────────────────────
        TestDOT token = new TestDOT();
        console.log("TestDOT deployed at    :", address(token));

        // ── 2. Mint tokens to deployer ───────────────────────────────────
        token.mint(deployer, cfg.mintAmount);
        console.log("Minted to deployer     :", cfg.mintAmount);

        // ── 3. Deploy KeeperOracle ───────────────────────────────────────
        KeeperOracle oracle = new KeeperOracle(
            cfg.admin, // admin role
            cfg.admin, // keeper role (admin can push prices initially)
            8, // 8 decimals (standard for USD feeds)
            "DOT / USD",
            3600, // 1 hour heartbeat
            cfg.initialPrice,
            100, // 1% deviation threshold (bps)
            1000 // 10% max deviation cap (bps)
        );
        console.log("KeeperOracle deployed  :", address(oracle));

        // ── 3b. Deploy OracleRegistry ────────────────────────────────────
        OracleRegistry registry = new OracleRegistry(cfg.admin);
        console.log("OracleRegistry deployed:", address(registry));

        // ── 4. Deploy ObidotVault ────────────────────────────────────────
        ObidotVault vault = new ObidotVault(
            IERC20(address(token)),
            address(oracle),
            cfg.depositCap,
            cfg.maxDailyLoss,
            cfg.maxRefTime,
            cfg.maxProofSize,
            cfg.admin
        );
        console.log("ObidotVault deployed   :", address(vault));
        console.log("Share token            :", vault.name());

        // ── 5. Register DOT feed in OracleRegistry ─────────────────────
        registry.setFeed(
            address(token),
            address(oracle),
            3600, // 1 hour heartbeat
            100 // 1% deviation alert threshold
        );
        console.log("DOT feed registered    : in OracleRegistry");

        // ── 6. Set OracleRegistry on vault ───────────────────────────────
        vault.setOracleRegistry(address(registry));
        console.log("OracleRegistry set on  : vault");

        // ── 7. Approve vault for deployer's tokens ───────────────────────
        token.approve(address(vault), type(uint256).max);
        console.log("Vault approved for     : max uint256");

        vm.stopBroadcast();

        // ── Verification ─────────────────────────────────────────────────
        require(vault.asset() == address(token), "Asset mismatch");
        require(address(vault.priceOracle()) == address(oracle), "Oracle mismatch");
        require(vault.depositCap() == cfg.depositCap, "Cap mismatch");
        require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), cfg.admin), "Admin role missing");
        require(!vault.paused(), "Should not be paused");
        require(token.balanceOf(deployer) == cfg.mintAmount, "Mint amount mismatch");

        (, int256 oraclePrice,,,) = oracle.latestRoundData();
        require(oraclePrice == cfg.initialPrice, "Oracle price mismatch");

        console.log("Verification: ALL CHECKS PASSED");
        console.log("");
        console.log("=== Testnet Deployment Complete ===");
        console.log("");
        console.log("Deployed contracts:");
        console.log("  TestDOT (tDOT)   :", address(token));
        console.log("  KeeperOracle     :", address(oracle));
        console.log("  OracleRegistry   :", address(registry));
        console.log("  ObidotVault      :", address(vault));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Update oracle price: cast send <oracle> 'updatePrice(int256)' <price>");
        console.log("  2. Deposit: cast send <vault> 'deposit(uint256,address)' <amount> <receiver>");
        console.log("  3. Grant STRATEGIST_ROLE if using AI agent");
        console.log("  4. Optionally run DeployCrossChain for cross-chain setup");
    }
}
