/**
 * Generates a deterministic sample receipt PNG for live vision testing.
 * The arithmetic is exact (subtotal 48.00, 12.5% service 6.00, total 54.00)
 * so checkReceiptArithmetic() must return zero issues on a faithful read.
 */
import { Jimp, loadFont } from "jimp";
import { SANS_16_BLACK, SANS_32_BLACK, SANS_14_BLACK } from "jimp/fonts";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "test", "fixtures", "receipt-sample.png");

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

line(big, "DISHOOM", 160);
y += 44;
line(body, "Kings Cross, London", 160);
y += 26;
line(small, "Date: 2026-08-01   Table 12", 140);
y += 30;
rule();

row("1  House Black Daal", "8.50");
row("2  Chicken Ruby", "29.80");
line(small, "   (2 x 14.90)", 60);
y += 24;
row("1  Garlic Naan", "4.50");
row("1  Mango Lassi", "5.20");
rule();

row("SUBTOTAL", "48.00");
row("SERVICE 12.5%", "6.00");
y += 6;
rule();
line(big, "TOTAL", 40);
image.print({ font: big, x: W - 160, y, text: "54.00" });
y += 50;
rule();

line(small, "Currency: GBP  -  VAT included", 120);
y += 24;
line(small, "Thank you! Please come again.", 130);

mkdirSync(dirname(outPath), { recursive: true });
await image.write(outPath);
console.log(`written: ${outPath}`);
