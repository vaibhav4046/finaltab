"use client";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export interface WalletAccount {
  address: `0x${string}`;
}

export const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_HEX = "0x14a34";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectWallet(): Promise<WalletAccount | null> {
  if (typeof window === "undefined" || !window.ethereum) {
    return null;
  }

  try {
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];

    if (!accounts || accounts.length === 0) {
      return null;
    }

    const address = accounts[0];
    if (!address || !ADDRESS_RE.test(address)) return null;
    return { address: address as `0x${string}` };
  } catch {
    return null;
  }
}

export async function getConnectedAccounts(): Promise<string[]> {
  if (typeof window === "undefined" || !window.ethereum) return [];

  try {
    const accounts = (await window.ethereum.request({
      method: "eth_accounts",
    })) as string[];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

export async function switchToBaseSepolia(): Promise<boolean> {
  if (!hasInjectedWallet()) return false;
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_HEX }],
    });
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? Number((error as { code: unknown }).code)
        : null;
    if (code !== 4902) return false;
    try {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_SEPOLIA_HEX,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function signMessage(account: `0x${string}`, message: string): Promise<`0x${string}` | null> {
  if (!hasInjectedWallet()) return null;
  try {
    const signature = await window.ethereum!.request({
      method: "personal_sign",
      params: [message, account],
    });
    return typeof signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(signature)
      ? (signature as `0x${string}`)
      : null;
  } catch {
    return null;
  }
}

export async function signEIP712(
  account: string,
  domain: object,
  types: object,
  value: object,
  primaryType: string = "ReceiveWithAuthorization",
): Promise<string | null> {
  if (typeof window === "undefined" || !window.ethereum) return null;

  try {
    const signature = (await window.ethereum.request({
      method: "eth_signTypedData_v4",
      params: [
        account,
        JSON.stringify({
          types,
          primaryType,
          domain,
          message: value,
        }),
      ],
    })) as string;
    return signature;
  } catch {
    return null;
  }
}
