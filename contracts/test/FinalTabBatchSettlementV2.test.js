const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = (value) => ethers.parseUnits(value, 6);
const LEDGER = ethers.keccak256(ethers.toUtf8Bytes("finaltab-v2-ledger"));

const AUTH_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const CONSENT_TYPES = {
  SettlementConsent: [
    { name: "planHash", type: "bytes32" },
    { name: "debtor", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const ZERO_PULL_SIGNATURES = {
  nonce: ethers.ZeroHash,
  authV: 27,
  authR: ethers.ZeroHash,
  authS: ethers.ZeroHash,
  consentV: 27,
  consentR: ethers.ZeroHash,
  consentS: ethers.ZeroHash,
};

function byAddress(a, b, field) {
  return a[field].toLowerCase().localeCompare(b[field].toLowerCase());
}

describe("FinalTabBatchSettlementV2", () => {
  let usdc;
  let settlement;
  let deployer;
  let alice;
  let bob;
  let carol;
  let dave;

  beforeEach(async () => {
    [deployer, alice, bob, carol, dave] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("MockUSDC3009")).deploy();
    settlement = await (
      await ethers.getContractFactory("FinalTabBatchSettlementV2")
    ).deploy(await usdc.getAddress());
    await usdc.mint(bob.address, USDC("100"));
    await usdc.mint(carol.address, USDC("100"));
    await usdc.mint(dave.address, USDC("100"));
  });

  async function buildPlan({
    ledgerHash = LEDGER,
    debits,
    payouts,
    validAfter = 0n,
    validBefore = 2_000_000_000n,
    sortPayouts = true,
  }) {
    const contractAddress = await settlement.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const sortedDebits = [...debits].sort((a, b) =>
      a.signer.address.toLowerCase().localeCompare(b.signer.address.toLowerCase()),
    );
    const normalizedPayouts = payouts.map((p) => ({ creditor: p.creditor, value: p.value }));
    if (sortPayouts) normalizedPayouts.sort((a, b) => byAddress(a, b, "creditor"));

    const unsignedPulls = sortedDebits.map(({ signer, value }) => ({
      from: signer.address,
      to: contractAddress,
      value,
      validAfter,
      validBefore,
      ...ZERO_PULL_SIGNATURES,
    }));
    const planHash = await settlement.computePlanHash(ledgerHash, unsignedPulls, normalizedPayouts);

    const pulls = [];
    for (let i = 0; i < sortedDebits.length; i++) {
      const { signer, value } = sortedDebits[i];
      const nonce = await settlement.authorizationNonce(planHash, signer.address, value);
      const authorization = {
        from: signer.address,
        to: contractAddress,
        value,
        validAfter,
        validBefore,
        nonce,
      };
      const authSignature = ethers.Signature.from(
        await signer.signTypedData(
          {
            name: "USDC",
            version: "2",
            chainId,
            verifyingContract: await usdc.getAddress(),
          },
          AUTH_TYPES,
          authorization,
        ),
      );
      const consentSignature = ethers.Signature.from(
        await signer.signTypedData(
          {
            name: "FINALTab Settlement",
            version: "2",
            chainId,
            verifyingContract: contractAddress,
          },
          CONSENT_TYPES,
          {
            planHash,
            debtor: signer.address,
            value,
            validAfter,
            validBefore,
          },
        ),
      );
      pulls.push({
        ...authorization,
        authV: authSignature.v,
        authR: authSignature.r,
        authS: authSignature.s,
        consentV: consentSignature.v,
        consentR: consentSignature.r,
        consentS: consentSignature.s,
      });
    }

    return { ledgerHash, settlementId: planHash, pulls, payouts: normalizedPayouts };
  }

  it("executes an exact two-debtor plan atomically", async () => {
    const plan = await buildPlan({
      debits: [
        { signer: bob, value: USDC("4.20") },
        { signer: carol, value: USDC("3.80") },
      ],
      payouts: [{ creditor: alice.address, value: USDC("8") }],
    });

    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    )
      .to.emit(settlement, "SettlementExecuted")
      .withArgs(plan.settlementId, plan.ledgerHash, 2, 1, USDC("8"));
    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("8"));
    expect(await usdc.balanceOf(await settlement.getAddress())).to.equal(0n);
  });

  it("computes the documented cross-client plan hash exactly", async () => {
    const plan = await buildPlan({
      debits: [
        { signer: bob, value: USDC("4.20") },
        { signer: carol, value: USDC("3.80") },
      ],
      payouts: [{ creditor: alice.address, value: USDC("8") }],
    });
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const debitTypehash = ethers.keccak256(ethers.toUtf8Bytes("Debit(address debtor,uint256 value)"));
    const payoutTypehash = ethers.keccak256(ethers.toUtf8Bytes("Payout(address creditor,uint256 value)"));
    const planTypehash = ethers.keccak256(
      ethers.toUtf8Bytes(
        "SettlementPlan(uint256 chainId,address settlementContract,address token,bytes32 ledgerHash,bytes32 debitsHash,bytes32 payoutsHash)",
      ),
    );
    const debitsHash = ethers.keccak256(
      ethers.concat(
        plan.pulls.map((pull) =>
          ethers.keccak256(
            coder.encode(["bytes32", "address", "uint256"], [debitTypehash, pull.from, pull.value]),
          ),
        ),
      ),
    );
    const payoutsHash = ethers.keccak256(
      ethers.concat(
        plan.payouts.map((payout) =>
          ethers.keccak256(
            coder.encode(
              ["bytes32", "address", "uint256"],
              [payoutTypehash, payout.creditor, payout.value],
            ),
          ),
        ),
      ),
    );
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const expected = ethers.keccak256(
      coder.encode(
        ["bytes32", "uint256", "address", "address", "bytes32", "bytes32", "bytes32"],
        [
          planTypehash,
          chainId,
          await settlement.getAddress(),
          await usdc.getAddress(),
          plan.ledgerHash,
          debitsHash,
          payoutsHash,
        ],
      ),
    );
    expect(plan.settlementId).to.equal(expected);
  });

  it("rejects payout redirection with the original signed settlementId", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    const redirected = [{ creditor: dave.address, value: USDC("10") }];
    await expect(
      settlement.connect(dave).executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, redirected),
    ).to.be.revertedWithCustomError(settlement, "SettlementIdMismatch");
    expect(await usdc.balanceOf(dave.address)).to.equal(USDC("100"));
    expect(await usdc.balanceOf(bob.address)).to.equal(USDC("100"));
  });

  it("binds payout amounts, count, and order into the signed plan", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [
        { creditor: alice.address, value: USDC("4") },
        { creditor: dave.address, value: USDC("6") },
      ],
    });
    const [first, second] = plan.payouts;
    const mutations = [
      [
        { ...first, value: first.value + 1n },
        { ...second, value: second.value - 1n },
      ],
      [{ creditor: alice.address, value: USDC("10") }],
      [...plan.payouts].reverse(),
    ];

    for (const payouts of mutations) {
      await expect(
        settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, payouts),
      ).to.be.revertedWithCustomError(settlement, "SettlementIdMismatch");
    }
  });

  it("rejects reused pulls even when an attacker recomputes the redirected plan id and nonce", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    const redirected = [{ creditor: dave.address, value: USDC("10") }];
    const redirectedId = await settlement.computePlanHash(plan.ledgerHash, plan.pulls, redirected);
    const forgedPull = {
      ...plan.pulls[0],
      nonce: await settlement.authorizationNonce(redirectedId, bob.address, USDC("10")),
    };
    await expect(
      settlement.connect(dave).executeSettlement(redirectedId, plan.ledgerHash, [forgedPull], redirected),
    ).to.be.revertedWithCustomError(settlement, "InvalidConsentSignature");
  });

  it("rejects wrong and missing plan-consent signatures", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const wrongSignature = ethers.Signature.from(
      await dave.signTypedData(
        {
          name: "FINALTab Settlement",
          version: "2",
          chainId,
          verifyingContract: await settlement.getAddress(),
        },
        CONSENT_TYPES,
        {
          planHash: plan.settlementId,
          debtor: bob.address,
          value: plan.pulls[0].value,
          validAfter: plan.pulls[0].validAfter,
          validBefore: plan.pulls[0].validBefore,
        },
      ),
    );
    const wrongConsent = {
      ...plan.pulls[0],
      consentV: wrongSignature.v,
      consentR: wrongSignature.r,
      consentS: wrongSignature.s,
    };
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, [wrongConsent], plan.payouts),
    ).to.be.revertedWithCustomError(settlement, "InvalidConsentSignature");

    const missingConsent = {
      ...plan.pulls[0],
      consentV: 27,
      consentR: ethers.ZeroHash,
      consentS: ethers.ZeroHash,
    };
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, [missingConsent], plan.payouts),
    ).to.be.reverted;
  });

  it("rejects cross-contract and cross-chain consent replay", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    const secondSettlement = await (
      await ethers.getContractFactory("FinalTabBatchSettlementV2")
    ).deploy(await usdc.getAddress());
    await expect(
      secondSettlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    ).to.be.revertedWithCustomError(secondSettlement, "SettlementIdMismatch");

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const wrongChainSignature = ethers.Signature.from(
      await bob.signTypedData(
        {
          name: "FINALTab Settlement",
          version: "2",
          chainId: chainId + 1n,
          verifyingContract: await settlement.getAddress(),
        },
        CONSENT_TYPES,
        {
          planHash: plan.settlementId,
          debtor: bob.address,
          value: plan.pulls[0].value,
          validAfter: plan.pulls[0].validAfter,
          validBefore: plan.pulls[0].validBefore,
        },
      ),
    );
    const crossChainPull = {
      ...plan.pulls[0],
      consentV: wrongChainSignature.v,
      consentR: wrongChainSignature.r,
      consentS: wrongChainSignature.s,
    };
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, [crossChainPull], plan.payouts),
    ).to.be.revertedWithCustomError(settlement, "InvalidConsentSignature");
  });

  it("allows exact-plan front-running but pays only the signed creditors once", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    await settlement
      .connect(dave)
      .executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts);
    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("10"));
    expect(await usdc.balanceOf(dave.address)).to.equal(USDC("100"));
    await expect(
      settlement.connect(bob).executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    ).to.be.revertedWithCustomError(settlement, "AlreadyExecuted");
  });

  it("rejects associating valid authorizations with another ledger", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    const otherLedger = ethers.keccak256(ethers.toUtf8Bytes("attacker-ledger"));
    const otherId = await settlement.computePlanHash(otherLedger, plan.pulls, plan.payouts);
    await expect(
      settlement.executeSettlement(otherId, otherLedger, plan.pulls, plan.payouts),
    ).to.be.revertedWithCustomError(settlement, "AuthorizationNonceMismatch");
  });

  it("aggregates one debtor across equal payouts without a duplicate nonce", async () => {
    const payouts = [
      { creditor: alice.address, value: USDC("5") },
      { creditor: carol.address, value: USDC("5") },
    ];
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts,
    });
    expect(plan.pulls).to.have.length(1);
    await settlement.connect(dave).executeSettlement(
      plan.settlementId,
      plan.ledgerHash,
      plan.pulls,
      plan.payouts,
    );
    expect(await usdc.balanceOf(alice.address)).to.equal(USDC("5"));
    expect(await usdc.balanceOf(carol.address)).to.equal(USDC("105"));
  });

  it("requires unique, strictly sorted debtors", async () => {
    const plan = await buildPlan({
      debits: [
        { signer: bob, value: USDC("5") },
        { signer: bob, value: USDC("5") },
      ],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    )
      .to.be.revertedWithCustomError(settlement, "DebtorsNotStrictlySorted")
      .withArgs(1);
  });

  it("requires unique, strictly sorted creditors", async () => {
    const payouts = [
      { creditor: carol.address, value: USDC("5") },
      { creditor: alice.address, value: USDC("5") },
    ];
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("10") }],
      payouts,
      sortPayouts: false,
    });
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    ).to.be.revertedWithCustomError(settlement, "CreditorsNotStrictlySorted");
  });

  it("reverts the whole batch when the USDC authorization is invalid", async () => {
    const plan = await buildPlan({
      debits: [
        { signer: bob, value: USDC("5") },
        { signer: carol, value: USDC("5") },
      ],
      payouts: [{ creditor: alice.address, value: USDC("10") }],
    });
    plan.pulls[1].authR = ethers.ZeroHash;
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    ).to.be.revertedWith("invalid signature");
    expect(await usdc.balanceOf(alice.address)).to.equal(0n);
    expect(await usdc.balanceOf(bob.address)).to.equal(USDC("100"));
  });

  it("rejects replay of an executed plan", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("1") }],
      payouts: [{ creditor: alice.address, value: USDC("1") }],
    });
    await settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts);
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    )
      .to.be.revertedWithCustomError(settlement, "AlreadyExecuted")
      .withArgs(plan.settlementId);
  });

  it("keeps authorization expiry fail-closed", async () => {
    const plan = await buildPlan({
      debits: [{ signer: bob, value: USDC("1") }],
      payouts: [{ creditor: alice.address, value: USDC("1") }],
      validBefore: 1n,
    });
    await expect(
      settlement.executeSettlement(plan.settlementId, plan.ledgerHash, plan.pulls, plan.payouts),
    ).to.be.revertedWith("authorization expired");
  });

  it("preserves exact conservation across deterministic generated plans", async () => {
    let seed = 0x5eedn;
    const next = () => {
      seed = (seed * 1103515245n + 12345n) % 2147483648n;
      return seed;
    };

    for (let i = 0; i < 12; i++) {
      const bobDebit = (next() % 9000n) + 1000n;
      const carolDebit = (next() % 9000n) + 1000n;
      const total = bobDebit + carolDebit;
      const alicePayout = (next() % (total - 1n)) + 1n;
      const davePayout = total - alicePayout;
      const ledgerHash = ethers.keccak256(ethers.toUtf8Bytes(`generated-plan-${i}`));
      const plan = await buildPlan({
        ledgerHash,
        debits: [
          { signer: bob, value: bobDebit },
          { signer: carol, value: carolDebit },
        ],
        payouts: [
          { creditor: alice.address, value: alicePayout },
          { creditor: dave.address, value: davePayout },
        ],
      });
      const beforeAlice = await usdc.balanceOf(alice.address);
      const beforeDave = await usdc.balanceOf(dave.address);
      const beforeBob = await usdc.balanceOf(bob.address);
      const beforeCarol = await usdc.balanceOf(carol.address);

      await settlement.executeSettlement(plan.settlementId, ledgerHash, plan.pulls, plan.payouts);

      expect((await usdc.balanceOf(alice.address)) - beforeAlice).to.equal(alicePayout);
      expect((await usdc.balanceOf(dave.address)) - beforeDave).to.equal(davePayout);
      expect(beforeBob - (await usdc.balanceOf(bob.address))).to.equal(bobDebit);
      expect(beforeCarol - (await usdc.balanceOf(carol.address))).to.equal(carolDebit);
      expect(await usdc.balanceOf(await settlement.getAddress())).to.equal(0n);
    }
  });
});
