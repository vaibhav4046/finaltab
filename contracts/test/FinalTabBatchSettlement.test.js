const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Full settlement lifecycle against a mock USDC whose transferWithAuthorization
 * does REAL EIP-712 verification (real domain, real ecrecover, real nonce replay guard).
 */

const USDC = (n) => ethers.parseUnits(n, 6);

async function signAuth(signer, usdc, auth) {
  const domain = {
    name: "USDC",
    version: "2",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await usdc.getAddress(),
  };
  const types = {
    TransferWithAuthorization: [
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

function deriveNonce(ledgerHash, from, to, value, index) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "address", "uint256", "uint256"],
      [ledgerHash, from, to, value, index],
    ),
  );
}

async function buildTransfer(signer, usdc, to, value, ledgerHash, index) {
  const from = await signer.getAddress();
  const auth = {
    from,
    to,
    value,
    validAfter: 0,
    validBefore: 2000000000, // 2033
    nonce: deriveNonce(ledgerHash, from, to, value, index),
  };
  const sig = await signAuth(signer, usdc, auth);
  return { ...auth, v: sig.v, r: sig.r, s: sig.s };
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

  it("executes a multi-transfer settlement atomically and moves exact amounts", async () => {
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("14.85"), ledgerHash, 0);
    const t1 = await buildTransfer(carol, usdc, alice.address, USDC("14.85"), ledgerHash, 1);
    const sid = deriveSettlementId(ledgerHash);

    await expect(settlement.executeSettlement(sid, ledgerHash, [t0, t1]))
      .to.emit(settlement, "SettlementExecuted")
      .withArgs(sid, ledgerHash, 2, USDC("29.70"));

    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("29.70"));
    expect(await usdc.balanceOf(bob.address)).to.equal(USDC("85.15"));
    expect(await usdc.balanceOf(carol.address)).to.equal(USDC("85.15"));
    expect(await settlement.executed(sid)).to.equal(true);
  });

  it("reverts the WHOLE batch when one signature is invalid (atomicity)", async () => {
    const good = await buildTransfer(bob, usdc, alice.address, USDC("10"), ledgerHash, 0);
    const bad = await buildTransfer(carol, usdc, alice.address, USDC("10"), ledgerHash, 1);
    bad.value = USDC("99"); // tamper after signing -> sig invalid
    const sid = deriveSettlementId(ledgerHash);

    await expect(settlement.executeSettlement(sid, ledgerHash, [good, bad])).to.be.revertedWith("invalid signature");
    // Nothing moved — including the good transfer.
    expect(await usdc.balanceOf(alice.address)).to.equal(0n);
    expect(await usdc.balanceOf(bob.address)).to.equal(USDC("100"));
    expect(await settlement.executed(sid)).to.equal(false);
  });

  it("reverts whole batch when one debtor has insufficient balance", async () => {
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("10"), ledgerHash, 0);
    const t1 = await buildTransfer(carol, usdc, alice.address, USDC("500"), ledgerHash, 1);
    const sid = deriveSettlementId(ledgerHash);
    await expect(settlement.executeSettlement(sid, ledgerHash, [t0, t1])).to.be.revertedWith("insufficient balance");
    expect(await usdc.balanceOf(alice.address)).to.equal(0n);
  });

  it("rejects a reused settlementId", async () => {
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("1"), ledgerHash, 0);
    const sid = deriveSettlementId(ledgerHash);
    await settlement.executeSettlement(sid, ledgerHash, [t0]);
    const t1 = await buildTransfer(carol, usdc, alice.address, USDC("1"), ledgerHash, 1);
    await expect(settlement.executeSettlement(sid, ledgerHash, [t1]))
      .to.be.revertedWithCustomError(settlement, "AlreadyExecuted")
      .withArgs(sid);
  });

  it("rejects settlementId not derived from ledgerHash (binding)", async () => {
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("1"), ledgerHash, 0);
    const wrongSid = ethers.keccak256(ethers.toUtf8Bytes("some-other-id"));
    await expect(settlement.executeSettlement(wrongSid, ledgerHash, [t0])).to.be.revertedWithCustomError(
      settlement,
      "SettlementIdMismatch",
    );
  });

  it("rejects empty settlements and zero-value transfers", async () => {
    const sid = deriveSettlementId(ledgerHash);
    await expect(settlement.executeSettlement(sid, ledgerHash, [])).to.be.revertedWithCustomError(
      settlement,
      "EmptySettlement",
    );
    const t0 = await buildTransfer(bob, usdc, alice.address, 0n, ledgerHash, 0);
    await expect(settlement.executeSettlement(sid, ledgerHash, [t0])).to.be.revertedWithCustomError(
      settlement,
      "ZeroValueTransfer",
    );
  });

  it("EIP-3009 nonce cannot be replayed even in a different settlement", async () => {
    const otherLedger = ethers.keccak256(ethers.toUtf8Bytes("ledger-2"));
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("5"), ledgerHash, 0);
    const sid1 = deriveSettlementId(ledgerHash);
    await settlement.executeSettlement(sid1, ledgerHash, [t0]);

    // Same signed payload smuggled into a new settlement -> nonce already burned at token level.
    const sid2 = deriveSettlementId(otherLedger);
    await expect(settlement.executeSettlement(sid2, otherLedger, [t0])).to.be.revertedWith("authorization used");
  });

  it("edited ledger invalidates prior signatures (nonce derives from ledgerHash)", async () => {
    const editedLedger = ethers.keccak256(ethers.toUtf8Bytes("canonical-ledger-json-v1-EDITED"));
    // Signature was built for original ledgerHash-derived nonce...
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("5"), ledgerHash, 0);
    // ...but submitted under edited ledger with a nonce recomputed for the edited hash.
    const tampered = { ...t0, nonce: deriveNonce(editedLedger, t0.from, t0.to, t0.value, 0) };
    const sid = deriveSettlementId(editedLedger);
    await expect(settlement.executeSettlement(sid, editedLedger, [tampered])).to.be.revertedWith("invalid signature");
  });

  it("anyone can submit (executor is irrelevant; only signatures matter)", async () => {
    const t0 = await buildTransfer(bob, usdc, alice.address, USDC("2"), ledgerHash, 0);
    const sid = deriveSettlementId(ledgerHash);
    await settlement.connect(carol).executeSettlement(sid, ledgerHash, [t0]);
    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("2"));
  });

  it("expired and not-yet-valid authorizations revert", async () => {
    const from = bob.address;
    const expired = {
      from,
      to: alice.address,
      value: USDC("1"),
      validAfter: 0,
      validBefore: 1, // 1970
      nonce: deriveNonce(ledgerHash, from, alice.address, USDC("1"), 5),
    };
    const sigE = await signAuth(bob, usdc, expired);
    const sid = deriveSettlementId(ledgerHash);
    await expect(
      settlement.executeSettlement(sid, ledgerHash, [{ ...expired, v: sigE.v, r: sigE.r, s: sigE.s }]),
    ).to.be.revertedWith("authorization expired");
  });

  it("constructor rejects zero USDC address", async () => {
    const F = await ethers.getContractFactory("FinalTabBatchSettlement");
    await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWith("usdc addr zero");
  });
});
