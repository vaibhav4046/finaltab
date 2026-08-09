import { Command } from "commander";
import chalk from "chalk";
import { readDb } from "../persistence.js";

export const proofCommand = new Command("proof")
  .description("Show proof of expense or settlement")
  .argument("<id>", "Expense or settlement ID")
  .action((id: string) => {
    const db = readDb();
    const expense = db.expenses.find((e) => e.id === id);

    if (!expense) {
      console.error(chalk.red(`✗ Expense or settlement not found: ${id}`));
      process.exit(1);
    }

    console.log(chalk.blue.bold("\n📋 Expense Proof\n"));
    console.log(`ID:        ${expense.id}`);
    console.log(`Merchant:  ${expense.merchant}`);
    console.log(`Date:      ${expense.timestamp}`);
    console.log(`Currency:  ${expense.currency}`);
    console.log(`Total:     ${expense.total}`);

    if (expense.items && expense.items.length > 0) {
      console.log(`\nItems:`);
      expense.items.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.description} - ${item.lineTotal}`);
      });
    }

    if (expense.settlement) {
      console.log(`\nSettlement:`);
      console.log(`  From: ${expense.settlement.from}`);
      console.log(`  To:   ${expense.settlement.to}`);
      console.log(`  Amount: ${expense.settlement.amount}`);
    }

    console.log("");
  });
