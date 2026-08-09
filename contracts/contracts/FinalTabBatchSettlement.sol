// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal EIP-3009 surface used by settlement. Base Sepolia USDC implements this.
interface IERC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title FinalTabBatchSettlement
/// @notice Atomically executes a batch of pre-signed USDC transfers that settle a frozen
///         FINALTab ledger. Funds move directly debtor -> creditor via EIP-3009
///         transferWithAuthorization; this contract NEVER holds or pools funds.
/// @dev Atomicity is intentional: no try/catch. If any authorization fails
///      (bad signature, reused nonce, insufficient balance), the entire settlement reverts.
///      settlementId is cryptographically bound to the ledger hash, so a settlement can only
///      be replayed as the exact same ledger — and the executed[] guard blocks even that.
contract FinalTabBatchSettlement {
    struct Transfer {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    IERC3009 public immutable usdc;

    mapping(bytes32 => bool) public executed;

    event SettlementExecuted(
        bytes32 indexed settlementId,
        bytes32 indexed ledgerHash,
        uint256 transferCount,
        uint256 totalAmount
    );

    event TransferSettled(bytes32 indexed settlementId, address indexed from, address indexed to, uint256 value);

    error AlreadyExecuted(bytes32 settlementId);
    error EmptySettlement();
    error SettlementIdMismatch(bytes32 expected, bytes32 provided);
    error ZeroValueTransfer(uint256 index);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "usdc addr zero");
        usdc = IERC3009(usdcAddress);
    }

    /// @param settlementId Must equal keccak256(abi.encode(ledgerHash)) — binds id to ledger content.
    /// @param ledgerHash keccak256 of the canonical frozen ledger JSON.
    /// @param transfers Pre-signed EIP-3009 authorizations, one per netted debt.
    function executeSettlement(bytes32 settlementId, bytes32 ledgerHash, Transfer[] calldata transfers) external {
        if (executed[settlementId]) revert AlreadyExecuted(settlementId);
        if (transfers.length == 0) revert EmptySettlement();
        bytes32 expected = keccak256(abi.encode(ledgerHash));
        if (settlementId != expected) revert SettlementIdMismatch(expected, settlementId);

        executed[settlementId] = true;

        uint256 total = 0;
        for (uint256 i = 0; i < transfers.length; i++) {
            Transfer calldata t = transfers[i];
            if (t.value == 0) revert ZeroValueTransfer(i);
            usdc.transferWithAuthorization(t.from, t.to, t.value, t.validAfter, t.validBefore, t.nonce, t.v, t.r, t.s);
            total += t.value;
            emit TransferSettled(settlementId, t.from, t.to, t.value);
        }

        emit SettlementExecuted(settlementId, ledgerHash, transfers.length, total);
    }
}
