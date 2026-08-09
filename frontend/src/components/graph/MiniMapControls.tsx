import { MiniMap, useReactFlow, type Node } from '@xyflow/react';
import type { DependencyNodeData } from './DependencyNode';
import { colorForNode } from '../../lib/graphColors';

interface MiniMapControlsProps {
  onReset: () => void;
}

/**
 * MiniMap + zoom/fit/reset controls, styled to match our design system.
 * `onReset` is external because "reset" means "clear selection/filters" for
 * us, not just re-centering the viewport (that's what fit-view does).
 */
export const MiniMapControls = ({ onReset }: MiniMapControlsProps) => {
  const flow = useReactFlow();

  return (
    <>
      <MiniMap
        pannable
        zoomable
        nodeColor={(n: Node) => {
          const data = n.data as DependencyNodeData | undefined;
          if (!data?.node) return '#334155';
          return colorForNode(data.node).ring;
        }}
        nodeStrokeColor="rgba(255,255,255,0.15)"
        maskColor="rgba(8, 9, 11, 0.6)"
        style={{
          background: 'rgba(13, 15, 20, 0.85)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
        }}
      />

      <div className="glass flex items-center gap-1 rounded-xl p-1 shadow-glass">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => flow.zoomIn({ duration: 200 })}
          className="rounded-lg px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => flow.zoomOut({ duration: 200 })}
          className="rounded-lg px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white"
        >
          −
        </button>
        <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
        <button
          type="button"
          aria-label="Fit view"
          onClick={() => flow.fitView({ duration: 250, padding: 0.2 })}
          className="rounded-lg px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white"
        >
          Fit
        </button>
        <button
          type="button"
          aria-label="Reset selection and filters"
          onClick={onReset}
          className="rounded-lg px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white"
        >
          Reset
        </button>
      </div>
    </>
  );
};
