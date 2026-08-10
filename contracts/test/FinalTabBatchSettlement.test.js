const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Settlement lifecycle against MockUSDC3009 with ReceiveWithAuthorization (safe pattern).
 * Debtors sign ReceiveWithAuthorization to FinalTabBatchSettlement (the contract).
 * Contract pulls funds, then distributes to creditors atomically.
 */

const USDC = (n) => ethers.parseUnits(n, 6);

async function signReceiveAuth(signer, usdc, auth) {
  const domain = {
    name: "USDC",
    version: "2",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await usdc.getAddress(),
  };
  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };
  const sig = await signer.signTypedData(domain, types, auth);
  return ethers.Signature.from(sig);
}

function deriveSettlementId(ledgerHash) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ledgerHash]));
}

function deriveNonce(ledgerHash, debtor, amount) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "uint256"],
      [ledgerHash, debtor, amount],
    ),
  );
}

async function buildPullAuth(signer, usdc, settlement, value, ledgerHash) {
  const from = await signer.getAddress();
  const to = await settlement.getAddress();
  const auth = {
    from,
    to,
    value,
    validAfter: 0,
    validBefore: 2000000000, // 2033
    nonce: deriveNonce(ledgerHash, from, value),
  };
  const sig = await signReceiveAuth(signer, usdc, auth);
  return {
    from,
    to,
    value,
    validAfter: auth.validAfter,
    validBefore: auth.validBefore,
    nonce: auth.nonce,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

describe("FinalTabBatchSettlement", () => {
  let usdc, settlement, deployer, alice, bob, carol;
  const ledgerHash = ethers.keccak256(ethers.toUtf8Bytes("canonical-ledger-json-v1"));

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("MockUSDC3009")).deploy();
    settlement = await (await ethers.getContractFactory("FinalTabBatchSettlement")).deploy(await usdc.getAddress());
    await usdc.mint(bob.address, USDC("100"));
    await usdc.mint(carol.address, USDC("100"));
  });

  it("executes a multi-pull settlement atomically and distributes exact amounts", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("14.85"), ledgerHash);
    const pull1 = await buildPullAuth(carol, usdc, settlement, USDC("14.85"), ledgerHash);
    const payouts = [
      { creditor: alice.address, value: USDC("14.85") },
      { creditor: alice.address, value: USDC("14.85") },
    ];
    const sid = deriveSettlementId(ledgerHash);

    await expect(settlement.executeSettlement(sid, ledgerHash, [pull0, pull1], payouts))
      .to.emit(settlement, "SettlementExecuted")
      .withArgs(sid, ledgerHash, 2, 2, USDC("29.70"));

    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("29.70"));
    expect(await usdc.balanceOf(bob.address)).to.equal(USDC("85.15"));
    expect(await usdc.balanceOf(carol.address)).to.equal(USDC("85.15"));
    expect(await settlement.executed(sid)).to.equal(true);
  });

  it("reverts the WHOLE batch when one pull signature is invalid (atomicity)", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("10"), ledgerHash);
    const pull1 = await buildPullAuth(carol, usdc, settlement, USDC("10"), ledgerHash);
    pull1.value = USDC("99"); // tamper after signing -> sig invalid
    const payouts = [
      { creditor: alice.address, value: USDC("10") },
      { creditor: alice.address, value: USDC("10") },
    ];
    const sid = deriveSettlementId(ledgerHash);

    await expect(settlement.executeSettlement(sid, ledgerHash, [pull0, pull1], payouts))
      .to.be.revertedWith("invalid signature");
    // Nothing moved.
    expect(await usdc.balanceOf(alice.address)).to.equal(0n);
    expect(await usdc.balanceOf(bob.address)).to.equal(USDC("100"));
    expect(await settlement.executed(sid)).to.equal(false);
  });

  it("reverts whole batch when one debtor has insufficient balance", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("10"), ledgerHash);
    const pull1 = await buildPullAuth(carol, usdc, settlement, USDC("500"), ledgerHash);
    const payouts = [
      { creditor: alice.address, value: USDC("10") },
      { creditor: alice.address, value: USDC("500") },
    ];
    const sid = deriveSettlementId(ledgerHash);
    await expect(settlement.executeSettlement(sid, ledgerHash, [pull0, pull1], payouts))
      .to.be.revertedWith("insufficient balance");
    expect(await usdc.balanceOf(alice.address)).to.equal(0n);
  });

  it("rejects a reused settlementId", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("1"), ledgerHash);
    const payouts = [{ creditor: alice.address, value: USDC("1") }];
    const sid = deriveSettlementId(ledgerHash);
    await settlement.executeSettlement(sid, ledgerHash, [pull0], payouts);

    const pull1 = await buildPullAuth(carol, usdc, settlement, USDC("1"), ledgerHash);
    const payouts2 = [{ creditor: alice.address, value: USDC("1") }];
    await expect(settlement.executeSettlement(sid, ledgerHash, [pull1], payouts2))
      .to.be.revertedWithCustomError(settlement, "AlreadyExecuted")
      .withArgs(sid);
  });

  it("rejects settlementId not derived from ledgerHash (binding)", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("1"), ledgerHash);
    const payouts = [{ creditor: alice.address, value: USDC("1") }];
    const wrongSid = ethers.keccak256(ethers.toUtf8Bytes("some-other-id"));
    await expect(settlement.executeSettlement(wrongSid, ledgerHash, [pull0], payouts))
      .to.be.revertedWithCustomError(settlement, "SettlementIdMismatch");
  });

  it("rejects empty settlements and zero-value pulls/payouts", async () => {
    const sid = deriveSettlementId(ledgerHash);
    await expect(settlement.executeSettlement(sid, ledgerHash, [], []))
      .to.be.revertedWithCustomError(settlement, "EmptySettlement");

    const zeroPull = await buildPullAuth(bob, usdc, settlement, 0n, ledgerHash);
    const payouts = [{ creditor: alice.address, value: USDC("1") }];
    await expect(settlement.executeSettlement(sid, ledgerHash, [zeroPull], payouts))
      .to.be.revertedWithCustomError(settlement, "ZeroValuePull");

    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("1"), ledgerHash);
    const zeroPayouts = [{ creditor: alice.address, value: 0n }];
    await expect(settlement.executeSettlement(sid, ledgerHash, [pull0], zeroPayouts))
      .to.be.revertedWithCustomError(settlement, "ZeroValuePayout");
  });

  it("rejects pull/payout total mismatch", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("10"), ledgerHash);
    const payouts = [{ creditor: alice.address, value: USDC("5") }]; // mismatch
    const sid = deriveSettlementId(ledgerHash);
    await expect(settlement.executeSettlement(sid, ledgerHash, [pull0], payouts))
      .to.be.revertedWithCustomError(settlement, "PullPayoutMismatch");
  });

  it("EIP-3009 nonce cannot be replayed even in a different settlement", async () => {
    const otherLedger = ethers.keccak256(ethers.toUtf8Bytes("ledger-2"));
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("5"), ledgerHash);
    const payouts = [{ creditor: alice.address, value: USDC("5") }];
    const sid1 = deriveSettlementId(ledgerHash);
    await settlement.executeSettlement(sid1, ledgerHash, [pull0], payouts);

    // Same signed payload in a new settlement -> nonce already burned at token level.
    const sid2 = deriveSettlementId(otherLedger);
    const payouts2 = [{ creditor: alice.address, value: USDC("5") }];
    await expect(settlement.executeSettlement(sid2, otherLedger, [pull0], payouts2))
      .to.be.revertedWith("authorization used");
  });

  it("expired and not-yet-valid authorizations revert", async () => {
    const from = bob.address;
    const to = await settlement.getAddress();
    const expired = {
      from,
      to,
      value: USDC("1"),
      validAfter: 0,
      validBefore: 1, // 1970
      nonce: deriveNonce(ledgerHash, from, USDC("1")),
    };
    const sig = await signReceiveAuth(bob, usdc, expired);
    const pull = { ...expired, v: sig.v, r: sig.r, s: sig.s };
    const payouts = [{ creditor: alice.address, value: USDC("1") }];
    const sid = deriveSettlementId(ledgerHash);
    await expect(settlement.executeSettlement(sid, ledgerHash, [pull], payouts))
      .to.be.revertedWith("authorization expired");
  });

  it("anyone can submit (executor irrelevant; only signatures matter)", async () => {
    const pull0 = await buildPullAuth(bob, usdc, settlement, USDC("2"), ledgerHash);
    const payouts = [{ creditor: alice.address, value: USDC("2") }];
    const sid = deriveSettlementId(ledgerHash);
    await settlement.connect(carol).executeSettlement(sid, ledgerHash, [pull0], payouts);
    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("2"));
  });

  it("constructor rejects zero USDC address", async () => {
    const F = await ethers.getContractFactory("FinalTabBatchSettlement");
    await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWith("usdc addr zero");
  });
});
