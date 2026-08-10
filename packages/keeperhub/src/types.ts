/**
 * Types mirror the KeeperHub Direct Execution API
 * (docs.keeperhub.com/api/direct-execution, captured 2026-08-09).
 */

export type ReceiptStatus = "success" | "reverted" | "safe_inner_failure" | "not_found" | "timeout";

/** Chain-re-fetched proof entry. THE authoritative record — never trust transactionHash alone. */
export interface ExecutionReceipt {
  hash: string;
  chainId: number;
  verified: boolean;
  receiptStatus: ReceiptStatus;
  blockNumber?: number;
  gasUsed?: string;
  verifiedAt?: string;
}

export type ExecutionStatus = "pending" | "submitted" | "completed" | "failed" | "cancelled";

export interface ExecutionStatusResponse {
  executionId: string;
  status: ExecutionStatus;
  transactionHash?: string;
  transactionLink?: string;
  receipts?: ExecutionReceipt[];
  sponsored?: boolean;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export interface SimulateSuccess {
  success: true;
  wouldRevert: false;
  [k: string]: unknown;
}

export interface SimulateRevert {
  success?: boolean;
  wouldRevert: true;
  revertReason?: string;
  code?: string;
  balanceWei?: string;
  requiredWei?: string;
  shortfallWei?: string;
  nativeSymbol?: string;
  originalError?: string;
  undecodedRevertData?: string;
  [k: string]: unknown;
}

export interface TransferRequest {
  chainId: number;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string;
  taskId?: string;
}

export interface ContractCallRequest {
  chainId: number;
  contractAddress: string;
  /**
   * Function to call. When `abi` is omitted KeeperHub auto-fetches the ABI from
   * the block explorer and accepts a full signature ("deployCreate(bytes)").
   * When `abi` IS supplied it looks the function up by name, so this must be the
   * bare name ("executeSettlement") — a full signature 400s with
   * "Function '...' not found in ABI".
   */
  functionName: string;
  /** KeeperHub requires the args array JSON-encoded as a string, not a raw array. */
  functionArgs: string;
  /**
   * ABI as a JSON-encoded string, same convention as functionArgs — a raw array
   * is rejected with "ABI is required". Required when the contract is not
   * verified on the explorer, since auto-fetch has nothing to read.
   */
  abi?: string;
  value?: string;
  taskId?: string;
}

export interface ExecuteAccepted {
  executionId: string;
  status: ExecutionStatus;
  idempotentReplay?: boolean;
  [k: string]: unknown;
}

export interface KeeperHubErrorBody {
  error?: string;
  code?: string;
  message?: string;
  originalExecutionId?: string | null;
  [k: string]: unknown;
}

export class KeeperHubError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly body: KeeperHubErrorBody | null,
  ) {
    super(message);
    this.name = "KeeperHubError";
  }
}

export class SimulationRevertError extends Error {
  constructor(
    message: string,
    public readonly detail: SimulateRevert,
  ) {
    super(message);
    this.name = "SimulationRevertError";
  }
}
