import { LEGEND_ORDER } from '../../lib/graphColors';

/**
 * Legend — colors + edge meanings. Rendered as a small glass card in the
 * corner of the graph.
 */
export const Legend = () => (
  <div className="glass rounded-xl p-3 text-[11px] shadow-glass">
    <div className="mb-2 flex items-center gap-2 text-white/85">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Legend</span>
    </div>
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {LEGEND_ORDER.map((entry) => (
        <li key={entry.key} className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm border"
            style={{ background: entry.fill, borderColor: entry.ring }}
          />
          <span className="text-white/70">{entry.label}</span>
        </li>
      ))}
    </ul>

    <div className="mt-3 border-t border-white/[0.06] pt-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        Edges
      </div>
      <ul className="flex flex-col gap-1 text-white/70">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[2px] w-6 rounded-full bg-white/30" />
          <span>imports</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[2px] w-6 rounded-full bg-[#3b82f6]" />
          <span>outgoing (selected)</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-[2px] w-6 rounded-full bg-[#7c5cff]" />
          <span>incoming (selected)</span>
        </li>
      </ul>
    </div>
  </div>
);
