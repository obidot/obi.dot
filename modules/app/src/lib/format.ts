import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a bigint string (wei) to human-readable with decimals */
export function formatTokenAmount(
  weiStr: string,
  decimals = 18,
  displayDecimals = 2,
): string {
  if (!weiStr || weiStr === "0") return "0.00";
  const value = BigInt(weiStr);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fractional = value % divisor;
  const fracStr = fractional.toString().padStart(decimals, "0");
  return `${whole.toLocaleString()}.${fracStr.slice(0, displayDecimals)}`;
}

/** Format a token amount as USD */
export function formatUsd(
  weiStr: string,
  decimals = 18,
  displayDecimals = 2,
): string {
  return `$${formatTokenAmount(weiStr, decimals, displayDecimals)}`;
}

/** Format a raw USD number */
export function formatUsdNumber(value: number, compact = false): string {
  if (compact && value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format APY percentage */
export function formatApy(apy: number): string {
  return `${apy.toFixed(2)}%`;
}

/** Truncate an address: 0x1234...abcd */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Format a timestamp to relative time (e.g. "2m ago") */
export function formatRelativeTime(timestamp: string | number): string {
  const now = Date.now();
  const then =
    typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp * 1000;
  const diff = now - then;

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Format a timestamp to locale string */
export function formatTimestamp(timestamp: string | number): string {
  const date =
    typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp * 1000);
  return date.toLocaleString();
}
