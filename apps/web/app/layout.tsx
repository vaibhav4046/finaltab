import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FINALTab — settle the table, prove it onchain",
  description:
    "Receipt to verified onchain settlement: Groq vision extraction, deterministic cent-perfect splitting, EIP-3009 signatures, KeeperHub-executed USDC batch settlement on Base Sepolia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-night text-[#ececef] antialiased">{children}</body>
    </html>
  );
}
