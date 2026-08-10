/**
 * Generates a deterministic SYNTHETIC USD receipt PNG.
 *
 * The GBP fixture (make-sample-receipt.mjs) is deliberately unsettleable —
 * USDC is USD-denominated, so a GBP ledger is split-only. This USD twin is the
 * fixture that can legally reach the chain, so it is the one the end-to-end
 * freeze/sign/simulate/execute walkthrough uses.
 *
 * Arithmetic is exact (54.00 + 4.86 tax + 11.14 tip = 70.00) so
 * checkReceiptArithmetic() must return zero issues on a faithful read.
 *
 * The merchant and footer say SYNTHETIC on the face of the image: this is a
 * generated test fixture, not a photograph of a real transaction, and nothing
 * downstream should ever present it as one.
 */
import { Jimp, loadFont } from "jimp";
import { SANS_16_BLACK, SANS_32_BLACK, SANS_14_BLACK } from "jimp/fonts";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "test", "fixtures", "receipt-sample-usd.png");

const W = 520;
const H = 760;
const image = new Jimp({ width: W, height: H, color: 0xffffffff });

const big = await loadFont(SANS_32_BLACK);
const body = await loadFont(SANS_16_BLACK);
const small = await loadFont(SANS_14_BLACK);

let y = 30;
function line(font, text, x = 40) {
  image.print({ font, x, y, text });
}
function row(left, right) {
  image.print({ font: body, x: 40, y, text: left });
  image.print({ font: body, x: W - 140, y, text: right });
  y += 28;
}
function rule() {
  for (let x = 40; x < W - 40; x++) {
    image.setPixelColor(0x000000ff, x, y);
    image.setPixelColor(0x000000ff, x, y + 1);
  }
  y += 16;
}

line(big, "TEST DINER", 140);
y += 44;
line(body, "Mission St, San Francisco", 130);
y += 26;
line(small, "Date: 2026-08-09   Table 4", 145);
y += 30;
rule();

row("1  Smash Burger", "14.00");
row("2  Truffle Fries", "18.00");
line(small, "   (2 x 9.00)", 60);
y += 24;
row("1  Old Fashioned", "16.00");
row("1  House Lemonade", "6.00");
rule();

row("SUBTOTAL", "54.00");
row("TAX 9%", "4.86");
row("TIP", "11.14");
y += 6;
rule();
line(big, "TOTAL", 40);
image.print({ font: big, x: W - 160, y, text: "70.00" });
y += 50;
rule();

line(small, "Currency: USD", 190);
y += 24;
line(small, "SYNTHETIC FIXTURE - NOT A REAL RECEIPT", 90);

mkdirSync(dirname(outPath), { recursive: true });
await image.write(outPath);
console.log(`written: ${outPath}`);
