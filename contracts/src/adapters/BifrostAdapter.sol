// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BifrostCodec} from "../libraries/BifrostCodec.sol";
import {IXcm} from "../interfaces/IXcm.sol";
import {MultiLocation} from "../libraries/MultiLocation.sol";

/// @title BifrostAdapter — Strategy adapter for Bifrost DeFi protocols
/// @notice Provides high-level functions to interact with Bifrost's DeFi suite
///         (SLP, DEX, Farming, SALP) via XCM from the Polkadot Hub.
///         Called by the ObidotVault during strategy execution to encode and
///         dispatch the appropriate XCM messages.
/// @dev This contract is both a strategy encoder (pure functions) and an XCM
///      dispatcher. The vault delegates Bifrost-specific XCM encoding to this
///      adapter, keeping the vault logic generic across DeFi protocols.
contract BifrostAdapter is AccessControl, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Role for addresses authorized to execute strategies via this adapter.
    bytes32 public constant STRATEGY_EXECUTOR_ROLE =
        keccak256("STRATEGY_EXECUTOR_ROLE");

    /// @dev The on-chain address of the XCM (Cross-Consensus Message) precompile
    address public constant XCM_PRECOMPILE_ADDR = address(0xA0000);

    /// @notice XCM precompile address on Polkadot Hub EVM.
    IXcm public constant XCM_PRECOMPILE = IXcm(XCM_PRECOMPILE_ADDR);

    // ─────────────────────────────────────────────────────────────────────
    //  Enums
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Types of Bifrost strategies supported by this adapter.
    enum BifrostStrategyType {
        MintVToken, // Mint vDOT/vKSM via SLP
        RedeemVToken, // Redeem vToken for underlying
        DEXSwap, // Swap tokens on Bifrost DEX
        FarmDeposit, // Deposit into farming pool
        FarmWithdraw, // Withdraw from farming pool
        FarmClaim, // Claim farming rewards
        SALPContribute // Contribute to crowdloan
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Generic strategy parameters for Bifrost operations.
    struct BifrostStrategy {
        /// The type of Bifrost strategy to execute.
        BifrostStrategyType strategyType;
        /// Primary currency ID (e.g., DOT for minting, inputToken for swap).
        uint32 currencyIdA;
        /// Secondary currency ID (e.g., vDOT for redeem, outputToken for swap).
        uint32 currencyIdB;
        /// Amount for the primary operation.
        uint256 amount;
        /// Minimum output expected (slippage protection).
        uint256 minOutput;
        /// Pool ID (for farming operations).
        uint256 poolId;
        /// Beneficiary AccountId32 on Bifrost.
        bytes32 beneficiary;
    }

    /// @notice Record of a Bifrost strategy execution.
    struct BifrostStrategyRecord {
        BifrostStrategyType strategyType;
        uint256 amount;
        uint256 executedAt;
        bytes32 xcmMessageHash;
        bool dispatched;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Unknown or unsupported strategy type.
    error UnsupportedStrategy(BifrostStrategyType strategyType);

    /// @dev Zero amount for strategy execution.
    error ZeroStrategyAmount();

    /// @dev Zero beneficiary.
    error ZeroBeneficiary();

    /// @dev XCM dispatch failed.
    error XcmDispatchFailed();

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a Bifrost strategy is dispatched via XCM.
    event BifrostStrategyDispatched(
        uint256 indexed strategyId,
        BifrostStrategyType indexed strategyType,
        uint256 amount,
        bytes32 beneficiary
    );

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Counter for Bifrost-specific strategy IDs.
    uint256 public bifrostStrategyCounter;

    /// @notice Bifrost strategy execution records.
    mapping(uint256 => BifrostStrategyRecord) public bifrostStrategies;

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @param _admin The admin address.
    /// @param _vault The vault address authorized to execute strategies.
    constructor(address _admin, address _vault) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(STRATEGY_EXECUTOR_ROLE, _vault);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Core — Strategy Execution
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Execute a Bifrost DeFi strategy by encoding and dispatching the appropriate XCM message.
    /// @param strategy The strategy parameters.
    /// @return strategyId The unique ID for this adapter-level strategy.
    /// @return xcmMessage The encoded XCM message that was dispatched.
    function executeBifrostStrategy(
        BifrostStrategy calldata strategy
    )
        external
        onlyRole(STRATEGY_EXECUTOR_ROLE)
        nonReentrant
        returns (uint256 strategyId, bytes memory xcmMessage)
    {
        if (
            strategy.amount == 0 &&
            strategy.strategyType != BifrostStrategyType.FarmClaim
        ) {
            revert ZeroStrategyAmount();
        }
        if (strategy.beneficiary == bytes32(0)) revert ZeroBeneficiary();

        // Encode the XCM message based on strategy type
        xcmMessage = _encodeStrategy(strategy);

        // Build destination
        bytes memory dest = BifrostCodec.bifrostDestination();

        // Dispatch XCM
        XCM_PRECOMPILE.send(dest, xcmMessage);

        // Record the strategy
        strategyId = bifrostStrategyCounter;
        unchecked {
            bifrostStrategyCounter = strategyId + 1;
        }

        bifrostStrategies[strategyId] = BifrostStrategyRecord({
            strategyType: strategy.strategyType,
            amount: strategy.amount,
            executedAt: block.timestamp,
            xcmMessageHash: keccak256(xcmMessage),
            dispatched: true
        });

        emit BifrostStrategyDispatched(
            strategyId,
            strategy.strategyType,
            strategy.amount,
            strategy.beneficiary
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  View — Strategy Encoding (for preview/estimation)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Preview the XCM message that would be dispatched for a strategy.
    /// @param strategy The strategy parameters.
    /// @return xcmMessage The encoded XCM message.
    function previewStrategy(
        BifrostStrategy calldata strategy
    ) external pure returns (bytes memory xcmMessage) {
        return _encodeStrategy(strategy);
    }

    /// @notice Get the Bifrost destination MultiLocation.
    /// @return dest The SCALE-encoded destination.
    function getBifrostDestination() external pure returns (bytes memory dest) {
        return BifrostCodec.bifrostDestination();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Strategy Encoding
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Route strategy encoding to the appropriate BifrostCodec function.
    function _encodeStrategy(
        BifrostStrategy calldata strategy
    ) internal pure returns (bytes memory) {
        if (strategy.strategyType == BifrostStrategyType.MintVToken) {
            return
                BifrostCodec.encodeMintVToken(
                    strategy.currencyIdA,
                    strategy.amount,
                    strategy.beneficiary
                );
        } else if (strategy.strategyType == BifrostStrategyType.RedeemVToken) {
            return
                BifrostCodec.encodeRedeemVToken(
                    strategy.currencyIdA,
                    strategy.amount,
                    strategy.beneficiary
                );
        } else if (strategy.strategyType == BifrostStrategyType.DEXSwap) {
            return
                BifrostCodec.encodeDEXSwap(
                    strategy.currencyIdA,
                    strategy.currencyIdB,
                    strategy.amount,
                    strategy.minOutput,
                    strategy.beneficiary
                );
        } else if (strategy.strategyType == BifrostStrategyType.FarmDeposit) {
            return
                BifrostCodec.encodeFarmingDeposit(
                    strategy.poolId,
                    strategy.amount,
                    strategy.beneficiary
                );
        } else if (strategy.strategyType == BifrostStrategyType.FarmWithdraw) {
            return
                BifrostCodec.encodeFarmingWithdraw(
                    strategy.poolId,
                    strategy.amount,
                    strategy.beneficiary
                );
        } else if (strategy.strategyType == BifrostStrategyType.FarmClaim) {
            return
                BifrostCodec.encodeFarmingClaim(
                    strategy.poolId,
                    strategy.beneficiary
                );
        } else if (
            strategy.strategyType == BifrostStrategyType.SALPContribute
        ) {
            return
                BifrostCodec.encodeSALPContribute(
                    strategy.currencyIdA, // parachainId stored in currencyIdA for SALP
                    strategy.amount,
                    strategy.beneficiary
                );
        } else {
            revert UnsupportedStrategy(strategy.strategyType);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-165
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc AccessControl
    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
