// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice EIP-3009 ReceiveWithAuthorization surface (safe pattern).
interface IERC3009Receive {
    function receiveWithAuthorization(
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

    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title FinalTabBatchSettlement
/// @notice Atomically executes a batch of pre-signed USDC ReceiveWithAuthorization
///         that settle a frozen FINALTab ledger. This contract pulls funds via signed
///         authorization, then distributes to creditors. Atomic: all pulls + payouts
///         succeed or the entire settlement reverts.
/// @dev Uses ReceiveWithAuthorization (safe EIP-3009) not TransferWithAuthorization
///      (which can be front-run). This contract is the signed recipient, preventing
///      nonce extraction. Zero net retained USDC: every pulled cent is paid out.
contract FinalTabBatchSettlement {
    struct PullAuthorization {
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

    struct Payout {
        address creditor;
        uint256 value;
    }

    IERC3009Receive public immutable usdc;

    mapping(bytes32 => bool) public executed;

    event SettlementExecuted(
        bytes32 indexed settlementId,
        bytes32 indexed ledgerHash,
        uint256 pullCount,
        uint256 payoutCount,
        uint256 totalAmount
    );

    event PullExecuted(bytes32 indexed settlementId, address indexed debtor, uint256 value);
    event PayoutExecuted(bytes32 indexed settlementId, address indexed creditor, uint256 value);

    error AlreadyExecuted(bytes32 settlementId);
    error EmptySettlement();
    error SettlementIdMismatch(bytes32 expected, bytes32 provided);
    error ZeroValuePull(uint256 index);
    error ZeroValuePayout(uint256 index);
    error PullPayoutMismatch(uint256 totalPulled, uint256 totalPayout);
    error RetainedUSDC(uint256 retained);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "usdc addr zero");
        usdc = IERC3009Receive(usdcAddress);
    }

    /// @notice Atomically pull authorized USDC from debtors and distribute to creditors.
    /// @param settlementId keccak256(abi.encode(ledgerHash)) — binds to frozen ledger.
    /// @param ledgerHash keccak256 of canonical frozen business ledger.
    /// @param pulls Array of ReceiveWithAuthorization signed by debtors (to: this contract).
    /// @param payouts Array of exact creditor amounts; must sum to total pulled.
    function executeSettlement(
        bytes32 settlementId,
        bytes32 ledgerHash,
        PullAuthorization[] calldata pulls,
        Payout[] calldata payouts
    ) external {
        if (executed[settlementId]) revert AlreadyExecuted(settlementId);
        if (pulls.length == 0 || payouts.length == 0) revert EmptySettlement();

        bytes32 expected = keccak256(abi.encode(ledgerHash));
        if (settlementId != expected) revert SettlementIdMismatch(expected, settlementId);

        uint256 prePullBalance = usdc.balanceOf(address(this));

        executed[settlementId] = true;

        uint256 totalPulled = 0;
        for (uint256 i = 0; i < pulls.length; i++) {
            PullAuthorization calldata p = pulls[i];
            if (p.value == 0) revert ZeroValuePull(i);

            usdc.receiveWithAuthorization(
                p.from,
                p.to,
                p.value,
                p.validAfter,
                p.validBefore,
                p.nonce,
                p.v,
                p.r,
                p.s
            );
            totalPulled += p.value;
            emit PullExecuted(settlementId, p.from, p.value);
        }

        uint256 totalPayout = 0;
        for (uint256 i = 0; i < payouts.length; i++) {
            Payout calldata p = payouts[i];
            if (p.value == 0) revert ZeroValuePayout(i);

            usdc.transfer(p.creditor, p.value);
            totalPayout += p.value;
            emit PayoutExecuted(settlementId, p.creditor, p.value);
        }

        if (totalPulled != totalPayout) revert PullPayoutMismatch(totalPulled, totalPayout);

        uint256 postPayoutBalance = usdc.balanceOf(address(this));
        uint256 expectedBalance = prePullBalance;
        if (postPayoutBalance != expectedBalance) revert RetainedUSDC(postPayoutBalance - expectedBalance);

        emit SettlementExecuted(settlementId, ledgerHash, pulls.length, payouts.length, totalPulled);
    }
}
