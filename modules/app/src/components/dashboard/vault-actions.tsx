"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, type Address } from "viem";
import { cn, formatTokenAmount } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { CONTRACTS, VAULT_ABI, ERC20_APPROVE_ABI } from "@/lib/constants";

type Action = "deposit" | "withdraw";

// Deposit flow: approve(VAULT, amount) on TestDOT → vault.deposit(amount, receiver)
// Withdraw flow: vault.withdraw(assets, receiver, owner) directly (no approval needed)
type DepositStep =
  | "idle"
  | "approving"
  | "approve-confirming"
  | "depositing"
  | "deposit-confirming"
  | "done";

type WithdrawStep = "idle" | "withdrawing" | "withdraw-confirming" | "done";

const PCT_OPTIONS = [
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1.0 },
];

const VAULT_ADDRESS = CONTRACTS.VAULT as Address;
const TEST_DOT_ADDRESS = CONTRACTS.TEST_DOT as Address;
const TOKEN_DECIMALS = 18;

export function VaultActions() {
  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");

  // ── Step state machines ─────────────────────────────────────────────────
  const [depositStep, setDepositStep] = useState<DepositStep>("idle");
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>("idle");

  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({
    address,
    token: TEST_DOT_ADDRESS,
    query: { enabled: isConnected && !!address },
  });

  // ── Approval (deposit flow only) ────────────────────────────────────────
  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: approveWalletPending,
    error: approveError,
  } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // ── Deposit ─────────────────────────────────────────────────────────────
  const {
    data: depositTxHash,
    writeContract: writeDeposit,
    isPending: depositWalletPending,
    error: depositError,
  } = useWriteContract();

  const { isLoading: depositConfirming, isSuccess: depositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  // ── Withdraw ────────────────────────────────────────────────────────────
  const {
    data: withdrawTxHash,
    writeContract: writeWithdraw,
    isPending: withdrawWalletPending,
    error: withdrawError,
  } = useWriteContract();

  const { isLoading: withdrawConfirming, isSuccess: withdrawConfirmed } =
    useWaitForTransactionReceipt({ hash: withdrawTxHash });

  // ── Deposit step machine ────────────────────────────────────────────────
  // approving → wallet opens → approve-confirming → wait on-chain → depositing → ...
  useEffect(() => {
    if (depositStep === "approving" && approveWalletPending) {
      setDepositStep("approve-confirming");
    }
  }, [depositStep, approveWalletPending]);

  useEffect(() => {
    if (depositStep === "approve-confirming" && approveConfirmed && address) {
      setDepositStep("depositing");
      const assets = parseUnits(amount, TOKEN_DECIMALS);
      writeDeposit({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [assets, address],
      });
    }
  }, [depositStep, approveConfirmed, address, amount, writeDeposit]);

  useEffect(() => {
    if (depositStep === "depositing" && depositWalletPending) {
      setDepositStep("deposit-confirming");
    }
  }, [depositStep, depositWalletPending]);

  useEffect(() => {
    if (depositStep === "deposit-confirming" && depositConfirmed) {
      setDepositStep("done");
      setAmount("");
    }
  }, [depositStep, depositConfirmed]);

  // Reset on errors
  useEffect(() => {
    if (approveError || depositError) setDepositStep("idle");
  }, [approveError, depositError]);

  // ── Withdraw step machine ───────────────────────────────────────────────
  useEffect(() => {
    if (withdrawStep === "withdrawing" && withdrawWalletPending) {
      setWithdrawStep("withdraw-confirming");
    }
  }, [withdrawStep, withdrawWalletPending]);

  useEffect(() => {
    if (withdrawStep === "withdraw-confirming" && withdrawConfirmed) {
      setWithdrawStep("done");
      setAmount("");
    }
  }, [withdrawStep, withdrawConfirmed]);

  useEffect(() => {
    if (withdrawError) setWithdrawStep("idle");
  }, [withdrawError]);

  // Reset steps when switching action
  useEffect(() => {
    setDepositStep("idle");
    setWithdrawStep("idle");
    setAmount("");
  }, [action]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmount(raw);
  };

  const balanceFormatted = balanceData
    ? Number(
        formatTokenAmount(
          balanceData.value.toString(),
          balanceData.decimals,
          6,
        ),
      )
    : 0;

  const handlePct = (fraction: number) => {
    if (!isConnected || balanceFormatted <= 0) return;
    const val = (balanceFormatted * fraction).toFixed(6).replace(/\.?0+$/, "");
    setAmount(val);
  };

  const handleSubmit = () => {
    if (!amount || !address || !isConnected) return;

    if (action === "deposit") {
      if (depositStep !== "idle" && depositStep !== "done") return;
      setDepositStep("approving");
      const assets = parseUnits(amount, TOKEN_DECIMALS);
      writeApprove({
        address: TEST_DOT_ADDRESS,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [VAULT_ADDRESS, assets],
      });
    } else {
      if (withdrawStep !== "idle" && withdrawStep !== "done") return;
      setWithdrawStep("withdrawing");
      const assets = parseUnits(amount, TOKEN_DECIMALS);
      writeWithdraw({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "withdraw",
        args: [assets, address, address],
      });
    }
  };

  // ── Derived UI ──────────────────────────────────────────────────────────
  const isDepositExecuting = depositStep !== "idle" && depositStep !== "done";
  const isWithdrawExecuting =
    withdrawStep !== "idle" && withdrawStep !== "done";
  const loading =
    action === "deposit" ? isDepositExecuting : isWithdrawExecuting;

  const depositTxConfirmed = depositStep === "done" && !!depositTxHash;
  const withdrawTxConfirmed = withdrawStep === "done" && !!withdrawTxHash;

  const txHash = action === "deposit" ? depositTxHash : withdrawTxHash;
  const txConfirmed =
    action === "deposit" ? depositTxConfirmed : withdrawTxConfirmed;

  const error =
    action === "deposit" ? (approveError ?? depositError) : withdrawError;

  const buttonLabel = () => {
    if (action === "deposit") {
      switch (depositStep) {
        case "approving":
          return "APPROVING...";
        case "approve-confirming":
          return "CONFIRMING APPROVAL...";
        case "depositing":
          return "DEPOSITING...";
        case "deposit-confirming":
          return "CONFIRMING DEPOSIT...";
        case "done":
          return "DEPOSIT AGAIN";
        default:
          return "DEPOSIT tDOT";
      }
    } else {
      switch (withdrawStep) {
        case "withdrawing":
          return "WITHDRAWING...";
        case "withdraw-confirming":
          return "CONFIRMING WITHDRAWAL...";
        case "done":
          return "WITHDRAW AGAIN";
        default:
          return "WITHDRAW tDOT";
      }
    }
  };

  const displayBalance =
    isConnected && balanceData
      ? `${formatTokenAmount(balanceData.value.toString(), balanceData.decimals, 4)} tDOT`
      : "—";

  return (
    <div className="p-4">
      {/* Header */}
      <h3 className="text-[13px] font-semibold text-text-primary mb-3">
        Vault Actions
      </h3>

      {/* Buy/Sell style tabs */}
      <div className="flex gap-[1px] rounded-md overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setAction("deposit")}
          className={cn(
            "flex-1 py-2 text-[13px] font-bold font-mono transition-colors",
            action === "deposit"
              ? "bg-primary text-background"
              : "bg-surface-hover text-text-muted hover:text-text-secondary",
          )}
        >
          DEPOSIT
        </button>
        <button
          type="button"
          onClick={() => setAction("withdraw")}
          className={cn(
            "flex-1 py-2 text-[13px] font-bold font-mono transition-colors",
            action === "withdraw"
              ? "bg-danger text-white"
              : "bg-surface-hover text-text-muted hover:text-text-secondary",
          )}
        >
          WITHDRAW
        </button>
      </div>

      {/* Available balance */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-text-muted">Available Balance</span>
        <span className="font-mono text-[12px] text-text-secondary">
          {displayBalance}
        </span>
      </div>

      {/* Amount input */}
      <div className="relative mb-3">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0.00"
          aria-label={`Amount to ${action}`}
          className="input-trading pr-16 text-right text-lg"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-text-muted">
          tDOT
        </span>
      </div>

      {/* Percentage buttons */}
      <div className="flex gap-1.5 mb-4">
        {PCT_OPTIONS.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            onClick={() => handlePct(value)}
            className="btn-ghost flex-1 py-1 text-[11px] font-mono"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cost summary */}
      <div className="space-y-1.5 mb-4 pb-4 border-b border-border">
        <div className="flex justify-between">
          <span className="text-[11px] text-text-muted">Cost</span>
          <span className="font-mono text-[12px] text-text-secondary">
            {amount || "0.00"} <span className="text-text-muted">tDOT</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] text-text-muted">Fee</span>
          <span className="font-mono text-[12px] text-text-secondary">
            0.0000
          </span>
        </div>
      </div>

      {/* Transaction confirmed */}
      {txConfirmed && txHash && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[11px] text-primary font-medium">
            {action === "deposit"
              ? "Deposit confirmed!"
              : "Withdrawal confirmed!"}
          </p>
          <p className="text-[10px] text-text-muted font-mono mt-0.5 break-all">
            {txHash}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
          <p className="text-[11px] text-danger">
            {error.message.slice(0, 120)}
          </p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="button"
        disabled={!isConnected || !amount || loading}
        onClick={handleSubmit}
        className={cn(action === "deposit" ? "btn-primary" : "btn-danger")}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {buttonLabel()}
      </button>

      {!isConnected && (
        <p className="mt-2 text-center text-[10px] text-text-muted">
          Connect wallet to enable transactions
        </p>
      )}
    </div>
  );
}
