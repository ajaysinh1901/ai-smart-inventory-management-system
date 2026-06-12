import React from 'react';
import Money from './Money';
import Skeleton from './Skeleton';

/**
 * <KpiStrip> — The single shared KPI primitive for every page.
 *
 * Props:
 *   items   — Array<{
 *               label:  string,
 *               value:  number | string,
 *               format?: 'money' | 'count' | 'raw',  // default 'count'
 *               delta?: { value: number, direction: 'up' | 'down' }
 *             }>
 *   loading — boolean
 *
 * Visual rules (from CEO directive):
 *   - NO icon. NO icon square. NO iconBg. Hard rule.
 *   - Label  : JetBrains Mono 11px uppercase tracked +0.08em, lamp-black @60%
 *   - Value  : Poppins 600 30px (money via <Money>, count as plain numeral)
 *   - Dividers: ink-rule vertical lines between tiles
 *   - Container: top+bottom border only, paper-card bg, no shadow
 */
export default function KpiStrip({ items = [], loading = false }) {
  return (
    <div className="
      w-full
      border-y border-paper-rule dark:border-ink-rule
      bg-paper-card dark:bg-ink-card
      grid
    "
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item, i) => (
        <KpiTile
          key={item.label}
          item={item}
          loading={loading}
          isLast={i === items.length - 1}
          index={i}
          total={items.length}
        />
      ))}
    </div>
  );
}

function KpiTile({ item, loading, isLast, index, total }) {
  const { label, value, format = 'count', delta } = item;

  return (
    <div
      className={`px-5 py-4 flex flex-col gap-1 min-w-0 ${isLast ? '' : 'border-r border-paper-rule dark:border-ink-rule'}`}
    >
      {/* ── Label ── */}
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] leading-none text-ink/60 dark:text-paper/60 truncate">
        {label}
      </p>

      {/* ── Hero Value ── */}
      {loading ? (
        <Skeleton className="h-8 w-28 mt-1" />
      ) : (
        <div className="mt-0.5">
          {format === 'money' ? (
            <span className="font-display font-semibold text-[28px] leading-none text-ink dark:text-paper">
              <Money value={Number(value) || 0} variant="hero" />
            </span>
          ) : (
            <span className="font-display font-semibold text-[28px] leading-none text-ink dark:text-paper tabular-nums">
              {value}
            </span>
          )}
        </div>
      )}

      {/* ── Delta ── */}
      {delta && !loading && (
        <p
          className={`font-mono text-[11px] tracking-[0.04em] leading-none mt-0.5 ${
            delta.direction === 'up'
              ? 'text-brass'
              : 'text-primary'
          }`}
        >
          {delta.direction === 'up' ? '▲' : '▼'} {delta.value}
        </p>
      )}
    </div>
  );
}
