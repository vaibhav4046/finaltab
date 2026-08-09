import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FINALTab — the bill isn't settled until the money moves",
  description:
    "FINALTab turns shared receipts into one agreed, verified settlement — from photo to zero IOUs. Deterministic splitting, EIP-3009 signatures, KeeperHub-executed USDC batch settlement on Base Sepolia, chain-verified receipts.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FINALTab",
  },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-txt antialiased">{children}</body>
    </html>
  );
}
