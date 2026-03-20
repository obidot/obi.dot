"use client";

import { useState, useCallback, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { CONTRACTS, GAS_LIMITS } from "@/lib/constants";
import { ERC20_APPROVE_ABI, LP_PAIR_ABI, LIQUIDITY_ROUTER_ABI } from "@/lib/abi";
import type { LiquidityPairMeta } from "@/types";

const ROUTER_ADDRESS = CONTRACTS.LIQUIDITY_ROUTER as Address;

// ── useLpBalance ──────────────────────────────────────────────────────────────

export function useLpBalance(pairAddress: Address) {
  const { address } = useAccount();
  const { data, refetch } = useReadContract({
    address: pairAddress,
    abi: LP_PAIR_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });
  const balance = (data as bigint | undefined) ?? 0n;
  return {
    balance,
    formatted: formatUnits(balance, 18),
    refetch,
  };
}

// ── usePoolShare ──────────────────────────────────────────────────────────────

export function usePoolShare(pairAddress: Address) {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: [
      {
        address: pairAddress,
        abi: LP_PAIR_ABI,
        functionName: "balanceOf",
        args: [address ?? "0x0000000000000000000000000000000000000000"],
      },
      { address: pairAddress, abi: LP_PAIR_ABI, functionName: "totalSupply" },
      { address: pairAddress, abi: LP_PAIR_ABI, functionName: "getReserves" },
    ],
    query: { enabled: !!address },
  });

  const balance = (data?.[0].result as bigint | undefined) ?? 0n;
  const totalSupply = (data?.[1].result as bigint | undefined) ?? 0n;
  const reserves = data?.[2].result as
    | readonly [bigint, bigint, number]
    | undefined;
  const reserve0 = reserves?.[0] ?? 0n;
  const reserve1 = reserves?.[1] ?? 0n;

  const sharePercent =
    totalSupply > 0n ? Number((balance * 10000n) / totalSupply) / 100 : 0;
  const amount0 = totalSupply > 0n ? (balance * reserve0) / totalSupply : 0n;
  const amount1 = totalSupply > 0n ? (balance * reserve1) / totalSupply : 0n;

  return {
    sharePercent,
    amount0,
    amount1,
    balance,
    totalSupply,
    reserve0,
    reserve1,
  };
}

// ── useAddLiquidity ───────────────────────────────────────────────────────────

export type AddLiquidityStep =
  | "idle"
  | "approving-token0"
  | "confirming-approve-0"
  | "approving-token1"
  | "confirming-approve-1"
  | "adding"
  | "confirming-add"
  | "done"
  | "error";

export function useAddLiquidity(pair: LiquidityPairMeta | null) {
  const { address } = useAccount();
  const [step, setStep] = useState<AddLiquidityStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [pendingArgs, setPendingArgs] = useState<{
    amt0: bigint;
    amt1: bigint;
    min0: bigint;
    min1: bigint;
    deadline: bigint;
  } | null>(null);

  const { data: approveTx0, writeContract: writeApprove0 } = useWriteContract();
  const { data: approveTx1, writeContract: writeApprove1 } = useWriteContract();
  const { data: addTx, writeContract: writeAdd } = useWriteContract();

  const { isSuccess: approve0Done } = useWaitForTransactionReceipt({
    hash: approveTx0,
  });
  const { isSuccess: approve1Done } = useWaitForTransactionReceipt({
    hash: approveTx1,
  });
  const { isSuccess: addDone } = useWaitForTransactionReceipt({ hash: addTx });

  // Step machine — approval 0 confirmed → start approval 1
  useEffect(() => {
    if (
      step === "confirming-approve-0" &&
      approve0Done &&
      pair &&
      pendingArgs
    ) {
      writeApprove1({
        address: pair.token1,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [ROUTER_ADDRESS, pendingArgs.amt1],
        gas: GAS_LIMITS.LP_APPROVE,
      });
      setStep("confirming-approve-1");
    }
  }, [step, approve0Done, pair, pendingArgs, writeApprove1]);

  // Step machine — approval 1 confirmed → addLiquidity
  useEffect(() => {
    if (
      step === "confirming-approve-1" &&
      approve1Done &&
      pair &&
      pendingArgs &&
      address
    ) {
      writeAdd({
        address: ROUTER_ADDRESS,
        abi: LIQUIDITY_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          pair.address,
          pendingArgs.amt0,
          pendingArgs.amt1,
          pendingArgs.min0,
          pendingArgs.min1,
          address,
          pendingArgs.deadline,
        ],
        gas: GAS_LIMITS.ADD_LIQUIDITY,
      });
      setStep("confirming-add");
    }
  }, [step, approve1Done, pair, pendingArgs, address, writeAdd]);

  // Step machine — add confirmed → done
  useEffect(() => {
    if (step === "confirming-add" && addDone) {
      setTxHash(addTx);
      setStep("done");
    }
  }, [step, addDone, addTx]);

  const execute = useCallback(
    (amount0: string, amount1: string, slippageBps: number) => {
      if (!pair || !address) return;
      try {
        setError(null);
        setStep("approving-token0");

        const amt0 = parseUnits(amount0, 18);
        const amt1 = parseUnits(amount1, 18);
        const min0 = amt0 - (amt0 * BigInt(slippageBps)) / 10000n;
        const min1 = amt1 - (amt1 * BigInt(slippageBps)) / 10000n;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        setPendingArgs({ amt0, amt1, min0, min1, deadline });

        writeApprove0({
          address: pair.token0,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [ROUTER_ADDRESS, amt0],
          gas: GAS_LIMITS.LP_APPROVE,
        });
        setStep("confirming-approve-0");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStep("error");
      }
    },
    [pair, address, writeApprove0],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(undefined);
    setPendingArgs(null);
  }, []);

  return { step, execute, reset, txHash, error };
}

// ── useRemoveLiquidity ────────────────────────────────────────────────────────

export type RemoveLiquidityStep =
  | "idle"
  | "approving-lp"
  | "confirming-approve-lp"
  | "removing"
  | "confirming-remove"
  | "done"
  | "error";

export function useRemoveLiquidity(pair: LiquidityPairMeta | null) {
  const { address } = useAccount();
  const [step, setStep] = useState<RemoveLiquidityStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [pendingArgs, setPendingArgs] = useState<{
    lpAmount: bigint;
    min0: bigint;
    min1: bigint;
    deadline: bigint;
  } | null>(null);

  const { data: approveTx, writeContract: writeApprove } = useWriteContract();
  const { data: removeTx, writeContract: writeRemove } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTx,
  });
  const { isSuccess: removeConfirmed } = useWaitForTransactionReceipt({
    hash: removeTx,
  });

  // Step machine — approve confirmed → removeLiquidity
  useEffect(() => {
    if (
      step === "confirming-approve-lp" &&
      approveConfirmed &&
      pair &&
      pendingArgs &&
      address
    ) {
      writeRemove({
        address: ROUTER_ADDRESS,
        abi: LIQUIDITY_ROUTER_ABI,
        functionName: "removeLiquidity",
        args: [
          pair.address,
          pendingArgs.lpAmount,
          pendingArgs.min0,
          pendingArgs.min1,
          address,
          pendingArgs.deadline,
        ],
        gas: GAS_LIMITS.REMOVE_LIQUIDITY,
      });
      setStep("confirming-remove");
    }
  }, [step, approveConfirmed, pair, pendingArgs, address, writeRemove]);

  // Step machine — remove confirmed → done
  useEffect(() => {
    if (step === "confirming-remove" && removeConfirmed) {
      setTxHash(removeTx);
      setStep("done");
    }
  }, [step, removeConfirmed, removeTx]);

  const execute = useCallback(
    (
      lpAmount: bigint,
      slippageBps: number,
      reserve0: bigint,
      reserve1: bigint,
      totalSupply: bigint,
    ) => {
      if (!pair || !address) return;
      try {
        setError(null);

        const out0 = totalSupply > 0n ? (lpAmount * reserve0) / totalSupply : 0n;
        const out1 = totalSupply > 0n ? (lpAmount * reserve1) / totalSupply : 0n;
        const min0 = out0 - (out0 * BigInt(slippageBps)) / 10000n;
        const min1 = out1 - (out1 * BigInt(slippageBps)) / 10000n;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        setPendingArgs({ lpAmount, min0, min1, deadline });

        writeApprove({
          address: pair.address,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [ROUTER_ADDRESS, lpAmount],
          gas: GAS_LIMITS.LP_APPROVE,
        });
        setStep("confirming-approve-lp");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStep("error");
      }
    },
    [pair, address, writeApprove],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(undefined);
    setPendingArgs(null);
  }, []);

  return { step, execute, reset, txHash, error };
}
