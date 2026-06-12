/**
 * WeightChip.jsx
 * Quick-add increment chips (+100g, +250g, +500g for kg; +100ml, +250ml, +500ml for l).
 * Props:
 *   unit: 'kg' | 'l' | 'g' | 'ml'
 *   onAdd(incrementInBaseUnit: number) — called with the increment in the product's native unit
 */
import React from 'react';
import { Plus } from 'lucide-react';

// Chip configs per unit
const CHIPS = {
  kg: [
    { label: '+100g', value: 0.1 },
    { label: '+250g', value: 0.25 },
    { label: '+500g', value: 0.5 },
  ],
  l: [
    { label: '+100ml', value: 0.1 },
    { label: '+250ml', value: 0.25 },
    { label: '+500ml', value: 0.5 },
  ],
  g: [
    { label: '+50g', value: 50 },
    { label: '+100g', value: 100 },
    { label: '+250g', value: 250 },
  ],
  ml: [
    { label: '+100ml', value: 100 },
    { label: '+250ml', value: 250 },
    { label: '+500ml', value: 500 },
  ],
};

export default function WeightChip({ unit = 'kg', onAdd }) {
  const chips = CHIPS[unit] || CHIPS.kg;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onAdd(chip.value)}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border border-paper-rule bg-paper-card text-sm font-mono font-medium text-ink/70 hover:border-primary hover:text-primary hover:bg-primary/5 active:scale-95 transition-all select-none"
        >
          <Plus size={12} />
          {chip.label}
        </button>
      ))}
    </div>
  );
}
