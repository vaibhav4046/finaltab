// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC3009ReceiveV2 is IERC20 {
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
}

/// @title FinalTabBatchSettlementV2
/// @notice Executes a permissionless but immutable settlement plan. Every debtor
///         signs both the USDC pull and a FINALTab-domain consent over the full
///         debit+payout plan, so an executor cannot redirect the pulled funds.
contract FinalTabBatchSettlementV2 is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct PullAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 authV;
        bytes32 authR;
        bytes32 authS;
        uint8 consentV;
        bytes32 consentR;
        bytes32 consentS;
    }

    struct Payout {
        address creditor;
        uint256 value;
    }

    bytes32 public constant DEBIT_TYPEHASH = keccak256("Debit(address debtor,uint256 value)");
    bytes32 public constant PAYOUT_TYPEHASH = keccak256("Payout(address creditor,uint256 value)");
    bytes32 public constant PLAN_TYPEHASH = keccak256(
        "SettlementPlan(uint256 chainId,address settlementContract,address token,bytes32 ledgerHash,bytes32 debitsHash,bytes32 payoutsHash)"
    );
    bytes32 public constant CONSENT_TYPEHASH = keccak256(
        "SettlementConsent(bytes32 planHash,address debtor,uint256 value,uint256 validAfter,uint256 validBefore)"
    );
    IERC3009ReceiveV2 public immutable usdc;

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
    error InvalidAddress(uint256 index);
    error ZeroValuePull(uint256 index);
    error ZeroValuePayout(uint256 index);
    error DebtorsNotStrictlySorted(uint256 index);
    error CreditorsNotStrictlySorted(uint256 index);
    error AuthorizationRecipientMismatch(uint256 index, address provided);
    error AuthorizationNonceMismatch(uint256 index, bytes32 expected, bytes32 provided);
    error InvalidConsentSignature(uint256 index, address expected, address recovered);
    error PullPayoutMismatch(uint256 totalPulled, uint256 totalPayout);
    error UnexpectedContractBalance(uint256 beforeBalance, uint256 afterBalance);

    constructor(address usdcAddress) EIP712("FINALTab Settlement", "2") {
        require(usdcAddress != address(0), "usdc addr zero");
        usdc = IERC3009ReceiveV2(usdcAddress);
    }

    function domainSeparator() public view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice The exact commitment signed by every debtor and used as settlementId.
    function computePlanHash(
        bytes32 ledgerHash,
        PullAuthorization[] calldata pulls,
        Payout[] calldata payouts
    ) public view returns (bytes32) {
        bytes32[] memory debitHashes = new bytes32[](pulls.length);
        for (uint256 i = 0; i < pulls.length; i++) {
            debitHashes[i] = keccak256(abi.encode(DEBIT_TYPEHASH, pulls[i].from, pulls[i].value));
        }

        bytes32[] memory payoutHashes = new bytes32[](payouts.length);
        for (uint256 i = 0; i < payouts.length; i++) {
            payoutHashes[i] = keccak256(abi.encode(PAYOUT_TYPEHASH, payouts[i].creditor, payouts[i].value));
        }

        return keccak256(
            abi.encode(
                PLAN_TYPEHASH,
                block.chainid,
                address(this),
                address(usdc),
                ledgerHash,
                keccak256(abi.encodePacked(debitHashes)),
                keccak256(abi.encodePacked(payoutHashes))
            )
        );
    }

    function authorizationNonce(bytes32 planHash, address debtor, uint256 value) public pure returns (bytes32) {
        return keccak256(abi.encode(planHash, debtor, value));
    }

    function consentDigest(
        bytes32 planHash,
        address debtor,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(CONSENT_TYPEHASH, planHash, debtor, value, validAfter, validBefore)
        );
        return _hashTypedDataV4(structHash);
    }

    function executeSettlement(
        bytes32 settlementId,
        bytes32 ledgerHash,
        PullAuthorization[] calldata pulls,
        Payout[] calldata payouts
    ) external nonReentrant {
        if (executed[settlementId]) revert AlreadyExecuted(settlementId);
        if (pulls.length == 0 || payouts.length == 0) revert EmptySettlement();

        bytes32 expectedPlanHash = computePlanHash(ledgerHash, pulls, payouts);
        if (settlementId != expectedPlanHash) revert SettlementIdMismatch(expectedPlanHash, settlementId);

        uint256 totalPulled = 0;
        address previousDebtor = address(0);
        for (uint256 i = 0; i < pulls.length; i++) {
            PullAuthorization calldata p = pulls[i];
            if (p.from == address(0)) revert InvalidAddress(i);
            if (p.value == 0) revert ZeroValuePull(i);
            if (uint160(p.from) <= uint160(previousDebtor)) revert DebtorsNotStrictlySorted(i);
            previousDebtor = p.from;
            if (p.to != address(this)) revert AuthorizationRecipientMismatch(i, p.to);

            bytes32 expectedNonce = authorizationNonce(expectedPlanHash, p.from, p.value);
            if (p.nonce != expectedNonce) revert AuthorizationNonceMismatch(i, expectedNonce, p.nonce);

            address recovered = ECDSA.recover(
                consentDigest(expectedPlanHash, p.from, p.value, p.validAfter, p.validBefore),
                p.consentV,
                p.consentR,
                p.consentS
            );
            if (recovered != p.from) revert InvalidConsentSignature(i, p.from, recovered);
            totalPulled += p.value;
        }

        uint256 totalPayout = 0;
        address previousCreditor = address(0);
        for (uint256 i = 0; i < payouts.length; i++) {
            Payout calldata p = payouts[i];
            if (p.creditor == address(0)) revert InvalidAddress(i);
            if (p.value == 0) revert ZeroValuePayout(i);
            if (uint160(p.creditor) <= uint160(previousCreditor)) revert CreditorsNotStrictlySorted(i);
            previousCreditor = p.creditor;
            totalPayout += p.value;
        }
        if (totalPulled != totalPayout) revert PullPayoutMismatch(totalPulled, totalPayout);

        uint256 prePullBalance = usdc.balanceOf(address(this));
        executed[settlementId] = true;

        for (uint256 i = 0; i < pulls.length; i++) {
            PullAuthorization calldata p = pulls[i];
            usdc.receiveWithAuthorization(
                p.from,
                p.to,
                p.value,
                p.validAfter,
                p.validBefore,
                p.nonce,
                p.authV,
                p.authR,
                p.authS
            );
            emit PullExecuted(settlementId, p.from, p.value);
        }

        for (uint256 i = 0; i < payouts.length; i++) {
            Payout calldata p = payouts[i];
            IERC20(address(usdc)).safeTransfer(p.creditor, p.value);
            emit PayoutExecuted(settlementId, p.creditor, p.value);
        }

        uint256 postPayoutBalance = usdc.balanceOf(address(this));
        if (postPayoutBalance != prePullBalance) {
            revert UnexpectedContractBalance(prePullBalance, postPayoutBalance);
        }

        emit SettlementExecuted(settlementId, ledgerHash, pulls.length, payouts.length, totalPulled);
    }
}
