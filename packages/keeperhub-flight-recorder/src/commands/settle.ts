import { Command } from "commander";
import chalk from "chalk";
import { readDb, writeLedger } from "../persistence.js";
import type { Account, Expense } from "../types.js";

export const settleCommand = new Command("settle")
  .description("Settle debts between two accounts")
  .argument("<from>", "Account name (payer)")
  .argument("<to>", "Account name (creditor)")
  .argument("<amount>", "Amount to settle")
  .option("--currency <cur>", "Currency code (default: GBP)", "GBP")
  .action(async (from: string, to: string, amountStr: string, options) => {
    const db = readDb();
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      console.error(chalk.red("✗ Amount must be positive"));
      process.exit(1);
    }

    const fromAcc = db.accounts.find((a) => a.name.toLowerCase() === from.toLowerCase());
    const toAcc = db.accounts.find((a) => a.name.toLowerCase() === to.toLowerCase());

    if (!fromAcc || !toAcc) {
      console.error(chalk.red("✗ Account not found"));
      process.exit(1);
    }

    const settlement: Expense = {
      id: `settle-${Date.now()}`,
      merchant: `Settlement: ${from} → ${to}`,
      timestamp: new Date().toISOString(),
      total: amount,
      currency: options.currency,
      items: [{ description: "Debt settlement", lineTotal: amount }],
      settlement: {
        from: from,
        to: to,
        amount: amount,
      },
    };

    db.expenses.push(settlement);
    writeLedger(db);

    console.log(chalk.green(`✓ Settled: ${from} paid ${to} ${options.currency} ${amount}`));
  });
