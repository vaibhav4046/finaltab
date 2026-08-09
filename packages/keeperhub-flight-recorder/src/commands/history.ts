import { Command } from "commander";
import chalk from "chalk";
import { readDb } from "../persistence.js";

export const historyCommand = new Command("history")
  .description("View expense and settlement history")
  .option("--limit <n>", "Limit number of entries", "20")
  .option("--account <name>", "Filter by account")
  .action((options) => {
    const db = readDb();
    const limit = Math.max(1, parseInt(options.limit, 10) || 20);
    let expenses = [...db.expenses].reverse().slice(0, limit);

    if (options.account) {
      const accountName = options.account.toLowerCase();
      expenses = expenses.filter((e) => {
        if (e.settlement) {
          return (
            e.settlement.from.toLowerCase() === accountName || e.settlement.to.toLowerCase() === accountName
          );
        }
        return false;
      });
    }

    if (expenses.length === 0) {
      console.log(chalk.yellow("No history found."));
      return;
    }

    console.log(chalk.blue.bold(`\n📜 History (${expenses.length} entries)\n`));
    expenses.forEach((exp, i) => {
      const date = new Date(exp.timestamp).toLocaleDateString();
      if (exp.settlement) {
        console.log(
          `${i + 1}. [${date}] ${exp.settlement.from} → ${exp.settlement.to}: ${exp.currency} ${exp.settlement.amount}`,
        );
      } else {
        console.log(`${i + 1}. [${date}] ${exp.merchant}: ${exp.currency} ${exp.total}`);
      }
    });

    console.log("");
  });
