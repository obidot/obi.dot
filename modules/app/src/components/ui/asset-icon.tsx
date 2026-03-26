"use client";

import Image from "next/image";
import { ASSET_REGISTRY, type AssetId, getAsset } from "@/lib/asset-registry";
import { cn } from "@/lib/format";

type AssetIconSize = "xs" | "sm" | "md" | "lg" | "hero";
type AssetIconVariant = "bare" | "soft" | "tile";

const SIZE_CLASSES: Record<AssetIconSize, string> = {
  xs: "h-5 w-5",
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
  hero: "h-16 w-16 sm:h-20 sm:w-20",
};

const PADDING_CLASSES: Record<AssetIconSize, string> = {
  xs: "p-0.5",
  sm: "p-1",
  md: "p-1.5",
  lg: "p-2",
  hero: "p-3",
};

const SIZE_PX: Record<AssetIconSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 44,
  hero: 80,
};

const VARIANT_CLASSES: Record<AssetIconVariant, string> = {
  bare: "border-transparent bg-transparent shadow-none",
  soft: "border border-border/20 bg-white/70 shadow-[2px_2px_0_0_var(--border)]",
  tile: "border-[3px] border-border bg-surface shadow-[3px_3px_0_0_var(--border)]",
};

function fallbackLabel(assetId: string): string {
  return (
    assetId
      .split(".")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase() ?? "??"
  );
}

export interface AssetIconProps {
  assetId?: AssetId | null;
  size?: AssetIconSize;
  variant?: AssetIconVariant;
  alt?: string;
  className?: string;
  imageClassName?: string;
  decorative?: boolean;
  priority?: boolean;
}

export function AssetIcon({
  assetId,
  size = "md",
  variant = "soft",
  alt,
  className,
  imageClassName,
  decorative = true,
  priority = false,
}: AssetIconProps) {
  const asset = assetId ? getAsset(assetId) : null;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[14px]",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
      aria-hidden={decorative}
    >
      {asset ? (
        <Image
          src={asset.src}
          alt={decorative ? "" : (alt ?? asset.alt)}
          fill
          sizes={`${SIZE_PX[size]}px`}
          priority={priority}
          className={cn(
            "object-contain",
            PADDING_CLASSES[size],
            imageClassName,
          )}
        />
      ) : (
        <span className="retro-label flex h-full w-full items-center justify-center text-[0.72rem] text-text-muted">
          {fallbackLabel(assetId ?? "na")}
        </span>
      )}
    </div>
  );
}

export function isKnownAssetId(value: string): value is AssetId {
  return value in ASSET_REGISTRY;
}
