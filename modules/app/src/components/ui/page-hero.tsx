import type { ReactNode } from "react";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  stats?: ReactNode;
}

/** Shared hero banner used across Strategies, Yields, and Agent pages */
export function PageHero({ eyebrow, title, description, stats }: PageHeroProps) {
  return (
    <div className="hero-banner px-6 py-5">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">{eyebrow}</p>
          <h1 className="mt-1 stat-number text-2xl text-text-primary">{title}</h1>
          <p className="mt-1 text-xs text-text-secondary">{description}</p>
        </div>
        {stats && (
          <div className="flex items-center gap-6">{stats}</div>
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
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="stat-number text-lg">{value}</span>
      </div>
    </div>
  );
}
