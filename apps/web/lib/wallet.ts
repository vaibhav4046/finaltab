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
  address: string;
}

export async function connectWallet(): Promise<WalletAccount | null> {
  if (typeof window === "undefined" || !window.ethereum) {
    console.error("MetaMask not installed");
    return null;
  }

  try {
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];

    if (!accounts || accounts.length === 0) {
      return null;
    }

    return { address: accounts[0] };
  } catch (err) {
    console.error("Wallet connection failed:", err);
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

export async function signEIP712(
  account: string,
  domain: Record<string, unknown>,
  types: Record<string, unknown>,
  value: Record<string, unknown>
): Promise<string | null> {
  if (typeof window === "undefined" || !window.ethereum) return null;

  try {
    const signature = (await window.ethereum.request({
      method: "eth_signTypedData_v4",
      params: [
        account,
        JSON.stringify({
          types,
          primaryType: "TransferWithAuthorization",
          domain,
          message: value,
        }),
      ],
    })) as string;
    return signature;
  } catch (err) {
    console.error("Signature failed:", err);
    return null;
  }
}
