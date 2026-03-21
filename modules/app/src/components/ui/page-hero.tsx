import type { ReactNode } from "react";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  stats?: ReactNode;
}

/** Shared hero banner used across Strategies, Yields, and Agent pages */
export function PageHero({
  eyebrow,
  title,
  description,
  stats,
}: PageHeroProps) {
  return (
    <div className="hero-banner px-6 py-5">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="retro-label text-[0.85rem] text-text-muted">
            {eyebrow}
          </p>
          <h1 className="mt-2 stat-number text-text-primary">{title}</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-text-secondary">
            {description}
          </p>
        </div>
        {stats && (
          <div className="flex flex-wrap items-center gap-3">{stats}</div>
        )}
      </div>
    </div>
  );
}

interface HeroStatProps {
  label: string;
  icon: ReactNode;
  value: ReactNode;
}

/** Individual stat cell inside a PageHero */
export function HeroStat({ label, icon, value }: HeroStatProps) {
  return (
    <div className="border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)]">
      <p className="retro-label text-[0.8rem] text-text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {icon}
        <span className="stat-number text-lg">{value}</span>
      </div>
    </div>
  );
}
