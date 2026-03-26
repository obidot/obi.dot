"use client";

import Image from "next/image";
import { AssetIcon } from "@/components/ui/asset-icon";
import {
  type AssetId,
  HERO_BACKGROUND_SRC,
  HERO_BRAND_SRC,
} from "@/lib/asset-registry";
import { cn } from "@/lib/format";

const BADGE_POSITIONS = [
  "left-4 top-4 sm:left-6 sm:top-6",
  "left-8 bottom-6 sm:left-10 sm:bottom-8",
  "right-6 top-8 sm:right-8 sm:top-10",
  "right-8 bottom-5 sm:right-10 sm:bottom-7",
];

export function HeroIllustration({
  title,
  badgeAssetIds,
  className,
}: {
  title: string;
  badgeAssetIds: AssetId[];
  className?: string;
}) {
  const visibleBadges = badgeAssetIds.slice(0, BADGE_POSITIONS.length);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden border-[3px] border-border bg-surface shadow-[4px_4px_0_0_var(--border)]",
        "min-h-[220px] p-4 sm:min-h-[250px] sm:p-5",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,79,163,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(125,226,199,0.24),transparent_32%)]" />
      <Image
        src={HERO_BACKGROUND_SRC}
        alt=""
        fill
        priority={false}
        className="object-cover opacity-[0.16] mix-blend-multiply scale-110"
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(255,255,255,0.18))]" />

      <div className="absolute inset-y-6 right-4 w-[54%] sm:right-6 sm:w-[48%]">
        <div className="relative h-full w-full">
          <Image
            src={HERO_BRAND_SRC}
            alt=""
            fill
            priority={false}
            className="object-contain opacity-95 drop-shadow-[0_18px_40px_rgba(230,0,122,0.28)]"
          />
        </div>
      </div>

      {visibleBadges.map((assetId, index) => (
        <div
          key={`${title}-${assetId}-${index}`}
          className={cn("absolute", BADGE_POSITIONS[index])}
        >
          <AssetIcon
            assetId={assetId}
            size={index === 0 ? "hero" : "lg"}
            variant="tile"
            className="bg-surface/90 backdrop-blur"
            priority={index === 0}
          />
        </div>
      ))}

      <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
        <div className="inline-flex max-w-[70%] items-center gap-2 border-[2px] border-border bg-surface/92 px-3 py-2 shadow-[2px_2px_0_0_var(--border)] backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_2px_rgba(255,79,163,0.15)]" />
          <p className="retro-label text-[0.78rem] leading-tight text-text-secondary">
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}
