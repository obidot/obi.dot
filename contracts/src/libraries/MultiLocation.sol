// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MultiLocation — SCALE-encoding helpers for Polkadot XCM locations
/// @notice Provides pure Solidity functions to construct SCALE-encoded
///         VersionedMultiLocation payloads that the XCM precompile expects.
/// @dev Encoding follows the Polkadot SCALE codec specification:
///      - Enums: single-byte variant index prefix
///      - u8: 1 byte
///      - u32: 4 bytes little-endian
///      - Compact<u32>: variable-length (1/2/4 bytes, two LSBs encode mode)
///      - Option<T>: 0x00 = None, 0x01 ++ encoded(T) = Some(T)
///      - Vec<u8>: compact-length prefix ++ raw bytes
///
///      XCM Versioned types use a version-discriminant prefix byte:
///        V3 = 0x03,  V4 = 0x04
///
///      Junction variant indices (V3/V4):
///        0x00 = Parachain(Compact<u32>)
///        0x01 = AccountId32 { network: Option<NetworkId>, id: [u8; 32] }
///        0x02 = AccountIndex64 { network: Option<NetworkId>, index: u64 }
///        0x03 = AccountKey20 { network: Option<NetworkId>, key: [u8; 20] }
///        0x04 = PalletInstance(u8)
///        0x05 = GeneralIndex(Compact<u128>)
///        0x06 = GeneralKey { length: u8, data: [u8; 32] }
///        0x07 = OnlyChild
///        0x08 = Plurality { ... }
///        0x09 = GlobalConsensus(NetworkId)
///
///      Junctions (Interior) enum:
///        0x00 = Here
///        0x01 = X1(Junction)
///        0x02 = X2(Junction, Junction)
///        ... up to 0x08 = X8(...)
library MultiLocation {
    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @dev XCM V3 version prefix byte.
    uint8 internal constant VERSION_V3 = 0x03;

    /// @dev XCM V4 version prefix byte.
    uint8 internal constant VERSION_V4 = 0x04;

    /// @dev Junction variant: Parachain.
    uint8 internal constant JUNCTION_PARACHAIN = 0x00;

    /// @dev Junction variant: AccountId32.
    uint8 internal constant JUNCTION_ACCOUNT_ID32 = 0x01;

    /// @dev Junction variant: AccountKey20.
    uint8 internal constant JUNCTION_ACCOUNT_KEY20 = 0x03;

    /// @dev Junction variant: PalletInstance.
    uint8 internal constant JUNCTION_PALLET_INSTANCE = 0x04;

    /// @dev Junction variant: GeneralIndex.
    uint8 internal constant JUNCTION_GENERAL_INDEX = 0x05;

    /// @dev Junctions variant: Here (no junctions).
    uint8 internal constant JUNCTIONS_HERE = 0x00;

    /// @dev Junctions variant: X1 (one junction).
    uint8 internal constant JUNCTIONS_X1 = 0x01;

    /// @dev Junctions variant: X2 (two junctions).
    uint8 internal constant JUNCTIONS_X2 = 0x02;

    /// @dev Junctions variant: X3 (three junctions).
    uint8 internal constant JUNCTIONS_X3 = 0x03;

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Thrown when a parachain ID exceeds the valid range for compact encoding.
    error InvalidParachainId(uint32 id);

    /// @dev Thrown when an unsupported XCM version is specified.
    error UnsupportedVersion(uint8 version);

    // ─────────────────────────────────────────────────────────────────────
    //  High-Level Builders — Versioned Locations
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode the relay chain location: { parents: 1, interior: Here }.
    /// @param version XCM version prefix (V3 = 0x03, V4 = 0x04).
    /// @return SCALE-encoded VersionedMultiLocation targeting the relay chain.
    function relayChain(uint8 version) internal pure returns (bytes memory) {
        _validateVersion(version);
        return abi.encodePacked(version, uint8(1), JUNCTIONS_HERE);
    }

    /// @notice Encode a sibling parachain location: { parents: 1, interior: X1(Parachain(id)) }.
    /// @param version     XCM version prefix.
    /// @param parachainId The target parachain ID.
    /// @return SCALE-encoded VersionedMultiLocation.
    function siblingParachain(
        uint8 version,
        uint32 parachainId
    ) internal pure returns (bytes memory) {
        _validateVersion(version);
        return
            abi.encodePacked(
                version,
                uint8(1), // parents = 1 (go up to relay)
                JUNCTIONS_X1, // interior = X1(...)
                _encodeParachainJunction(parachainId)
            );
    }

    /// @notice Encode a sibling parachain + AccountId32 location:
    ///         { parents: 1, interior: X2(Parachain(id), AccountId32 { network: None, id }) }.
    /// @param version     XCM version prefix.
    /// @param parachainId The target parachain ID.
    /// @param accountId   The 32-byte substrate account ID.
    /// @return SCALE-encoded VersionedMultiLocation.
    function siblingParachainAccountId32(
        uint8 version,
        uint32 parachainId,
        bytes32 accountId
    ) internal pure returns (bytes memory) {
        _validateVersion(version);
        return
            abi.encodePacked(
                version,
                uint8(1), // parents = 1
                JUNCTIONS_X2, // interior = X2(...)
                _encodeParachainJunction(parachainId),
                _encodeAccountId32Junction(accountId)
            );
    }

    /// @notice Encode a sibling parachain + AccountKey20 location:
    ///         { parents: 1, interior: X2(Parachain(id), AccountKey20 { network: None, key }) }.
    /// @param version     XCM version prefix.
    /// @param parachainId The target parachain ID.
    /// @param account     The 20-byte EVM/Ethereum account address.
    /// @return SCALE-encoded VersionedMultiLocation.
    function siblingParachainAccountKey20(
        uint8 version,
        uint32 parachainId,
        address account
    ) internal pure returns (bytes memory) {
        _validateVersion(version);
        return
            abi.encodePacked(
                version,
                uint8(1), // parents = 1
                JUNCTIONS_X2, // interior = X2(...)
                _encodeParachainJunction(parachainId),
                _encodeAccountKey20Junction(account)
            );
    }

    /// @notice Encode a sibling parachain + PalletInstance + GeneralIndex location:
    ///         { parents: 1, interior: X3(Parachain(id), PalletInstance(pallet), GeneralIndex(index)) }.
    /// @dev Useful for targeting specific assets on remote parachains (e.g. asset pallet).
    /// @param version       XCM version prefix.
    /// @param parachainId   The target parachain ID.
    /// @param palletIndex   The pallet instance index.
    /// @param generalIndex  The general index within the pallet (e.g. asset ID).
    /// @return SCALE-encoded VersionedMultiLocation.
    function siblingParachainPalletAsset(
        uint8 version,
        uint32 parachainId,
        uint8 palletIndex,
        uint128 generalIndex
    ) internal pure returns (bytes memory) {
        _validateVersion(version);
        return
            abi.encodePacked(
                version,
                uint8(1), // parents = 1
                JUNCTIONS_X3, // interior = X3(...)
                _encodeParachainJunction(parachainId),
                _encodePalletInstanceJunction(palletIndex),
                _encodeGeneralIndexJunction(generalIndex)
            );
    }

    /// @notice Encode a local "here" location: { parents: 0, interior: Here }.
    /// @param version XCM version prefix.
    /// @return SCALE-encoded VersionedMultiLocation for the local chain.
    function localHere(uint8 version) internal pure returns (bytes memory) {
        _validateVersion(version);
        return abi.encodePacked(version, uint8(0), JUNCTIONS_HERE);
    }

    /// @notice Encode a child parachain location: { parents: 0, interior: X1(Parachain(id)) }.
    /// @dev Used when sending from relay chain downward.
    /// @param version     XCM version prefix.
    /// @param parachainId The target child parachain ID.
    /// @return SCALE-encoded VersionedMultiLocation.
    function childParachain(
        uint8 version,
        uint32 parachainId
    ) internal pure returns (bytes memory) {
        _validateVersion(version);
        return
            abi.encodePacked(
                version,
                uint8(0), // parents = 0 (already on relay)
                JUNCTIONS_X1, // interior = X1(...)
                _encodeParachainJunction(parachainId)
            );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Junction Encoders
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode a Parachain junction: Parachain(Compact<u32>).
    /// @param parachainId The parachain ID.
    /// @return The SCALE-encoded junction bytes.
    function _encodeParachainJunction(
        uint32 parachainId
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                JUNCTION_PARACHAIN,
                _encodeCompactU32(parachainId)
            );
    }

    /// @notice Encode an AccountId32 junction: AccountId32 { network: None, id: [u8; 32] }.
    /// @param accountId The 32-byte substrate account identifier.
    /// @return The SCALE-encoded junction bytes.
    function _encodeAccountId32Junction(
        bytes32 accountId
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                JUNCTION_ACCOUNT_ID32,
                uint8(0x00), // Option<NetworkId>::None
                accountId // [u8; 32]
            );
    }

    /// @notice Encode an AccountKey20 junction: AccountKey20 { network: None, key: [u8; 20] }.
    /// @param account The 20-byte EVM address.
    /// @return The SCALE-encoded junction bytes.
    function _encodeAccountKey20Junction(
        address account
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                JUNCTION_ACCOUNT_KEY20,
                uint8(0x00), // Option<NetworkId>::None
                account // [u8; 20]
            );
    }

    /// @notice Encode a PalletInstance junction: PalletInstance(u8).
    /// @param palletIndex The pallet index byte.
    /// @return The SCALE-encoded junction bytes.
    function _encodePalletInstanceJunction(
        uint8 palletIndex
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(JUNCTION_PALLET_INSTANCE, palletIndex);
    }

    /// @notice Encode a GeneralIndex junction: GeneralIndex(Compact<u128>).
    /// @param index The general index value.
    /// @return The SCALE-encoded junction bytes.
    function _encodeGeneralIndexJunction(
        uint128 index
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(JUNCTION_GENERAL_INDEX, _encodeCompactU128(index));
    }

    // ─────────────────────────────────────────────────────────────────────
    //  SCALE Compact Encoding
    // ─────────────────────────────────────────────────────────────────────

    /// @notice SCALE-encode a uint32 in Compact form.
    /// @dev Compact<u32> encoding modes:
    ///      - Single-byte mode  (0..=63):             [value<<2 | 0b00]
    ///      - Two-byte mode     (64..=16383):         [value<<2 | 0b01] as u16 LE
    ///      - Four-byte mode    (16384..=1073741823): [value<<2 | 0b10] as u32 LE
    /// @param value The uint32 value to compact-encode.
    /// @return The SCALE compact-encoded bytes.
    function _encodeCompactU32(
        uint32 value
    ) internal pure returns (bytes memory) {
        if (value <= 0x3F) {
            // Single-byte mode
            return abi.encodePacked(uint8(value << 2));
        } else if (value <= 0x3FFF) {
            // Two-byte mode (little-endian u16)
            uint16 encoded = uint16(value << 2) | 0x01;
            return abi.encodePacked(uint8(encoded & 0xFF), uint8(encoded >> 8));
        } else if (value <= 0x3FFFFFFF) {
            // Four-byte mode (little-endian u32)
            uint32 encoded = (value << 2) | 0x02;
            return
                abi.encodePacked(
                    uint8(encoded & 0xFF),
                    uint8((encoded >> 8) & 0xFF),
                    uint8((encoded >> 16) & 0xFF),
                    uint8(encoded >> 24)
                );
        } else {
            revert InvalidParachainId(value);
        }
    }

    /// @notice SCALE-encode a uint128 in Compact form.
    /// @dev Extends compact encoding to handle u128 values. Uses big-integer mode
    ///      (prefix byte = number_of_bytes << 2 | 0b11) for values > 2^30.
    /// @param value The uint128 value to compact-encode.
    /// @return The SCALE compact-encoded bytes.
    function _encodeCompactU128(
        uint128 value
    ) internal pure returns (bytes memory) {
        if (value <= 0x3F) {
            return abi.encodePacked(uint8(uint8(value) << 2));
        } else if (value <= 0x3FFF) {
            uint16 encoded = uint16(value << 2) | 0x01;
            return abi.encodePacked(uint8(encoded & 0xFF), uint8(encoded >> 8));
        } else if (value <= 0x3FFFFFFF) {
            uint32 encoded = uint32(value << 2) | 0x02;
            return
                abi.encodePacked(
                    uint8(encoded & 0xFF),
                    uint8((encoded >> 8) & 0xFF),
                    uint8((encoded >> 16) & 0xFF),
                    uint8(encoded >> 24)
                );
        } else {
            // Big-integer mode: prefix = (byteLen - 4) << 2 | 0b11
            // Determine the minimal byte length needed
            uint128 temp = value;
            uint8 byteLen = 0;
            while (temp > 0) {
                byteLen++;
                temp >>= 8;
            }
            // Prefix byte encodes (byteLen - 4) in upper 6 bits, mode 0b11 in lower 2
            bytes memory result = new bytes(1 + byteLen);
            result[0] = bytes1(((byteLen - 4) << 2) | 0x03);
            // Encode value as little-endian bytes
            temp = value;
            for (uint8 i = 0; i < byteLen; i++) {
                result[1 + i] = bytes1(uint8(temp & 0xFF));
                temp >>= 8;
            }
            return result;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Utilities
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Extract a parachain ID from a SCALE-encoded destination for validation.
    /// @dev Expects the destination to be a VersionedMultiLocation with
    ///      parents=1 and interior=X1(Parachain(id)) or X2(Parachain(id), ...).
    ///      Returns 0 if the format doesn't match or points to the relay chain.
    /// @param dest The SCALE-encoded VersionedMultiLocation bytes.
    /// @return parachainId The extracted parachain ID, or 0 if not applicable.
    function extractParachainId(
        bytes memory dest
    ) internal pure returns (uint32 parachainId) {
        // Minimum: version(1) + parents(1) + junctions_variant(1) + junction_variant(1) + compact(1) = 5
        if (dest.length < 5) return 0;

        // Check version byte (V3 or V4)
        uint8 version = uint8(dest[0]);
        if (version != VERSION_V3 && version != VERSION_V4) return 0;

        // Check parents = 1
        if (uint8(dest[1]) != 1) return 0;

        // Check interior is X1 or X2+ (variant index >= 1)
        uint8 junctionsVariant = uint8(dest[2]);
        if (junctionsVariant == JUNCTIONS_HERE) return 0;

        // Check first junction is Parachain
        if (uint8(dest[3]) != JUNCTION_PARACHAIN) return 0;

        // Decode compact u32 starting at index 4
        (parachainId, ) = _decodeCompactU32(dest, 4);
    }

    /// @notice Decode a SCALE Compact<u32> value from a byte array at a given offset.
    /// @param data   The byte array containing the compact-encoded value.
    /// @param offset The starting byte offset.
    /// @return value     The decoded uint32 value.
    /// @return newOffset The offset after the compact-encoded value.
    function _decodeCompactU32(
        bytes memory data,
        uint256 offset
    ) internal pure returns (uint32 value, uint256 newOffset) {
        uint8 firstByte = uint8(data[offset]);
        uint8 mode = firstByte & 0x03;

        if (mode == 0) {
            // Single-byte mode
            value = uint32(firstByte >> 2);
            newOffset = offset + 1;
        } else if (mode == 1) {
            // Two-byte mode (little-endian)
            require(
                offset + 2 <= data.length,
                "MultiLocation: truncated compact u16"
            );
            uint16 raw = uint16(uint8(data[offset])) |
                (uint16(uint8(data[offset + 1])) << 8);
            value = uint32(raw >> 2);
            newOffset = offset + 2;
        } else if (mode == 2) {
            // Four-byte mode (little-endian)
            require(
                offset + 4 <= data.length,
                "MultiLocation: truncated compact u32"
            );
            uint32 raw = uint32(uint8(data[offset])) |
                (uint32(uint8(data[offset + 1])) << 8) |
                (uint32(uint8(data[offset + 2])) << 16) |
                (uint32(uint8(data[offset + 3])) << 24);
            value = raw >> 2;
            newOffset = offset + 4;
        } else {
            revert("MultiLocation: big-integer compact not supported for u32");
        }
    }

    /// @dev Validate the XCM version byte is V3 or V4.
    function _validateVersion(uint8 version) private pure {
        if (version != VERSION_V3 && version != VERSION_V4) {
            revert UnsupportedVersion(version);
        }
    }
}
