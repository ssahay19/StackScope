import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DependencyNode as DepNode } from '../../types/parsing';
import { colorForNode } from '../../lib/graphColors';

/**
 * DependencyNode — the React Flow custom node for every file in the graph.
 *
 * Data passed in `data`:
 *   - node: the raw DependencyNode from the backend
 *   - highlight: 'selected' | 'connected' | 'dimmed' | 'match' | null
 *
 * The node is intentionally compact (200x64 in the layout). Deeper info lives
 * in the side panel; the node only carries the identifier and the essentials
 * the spec requires: filename, extension, symbol count.
 */

export interface DependencyNodeData {
  node: DepNode;
  highlight: 'selected' | 'connected' | 'dimmed' | 'match' | null;
  filename: string;
  [key: string]: unknown;
}

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 68;

const DependencyNodeInner = ({ data, selected }: NodeProps) => {
  const nd = data as DependencyNodeData;
  const { node, highlight, filename } = nd;
  const tokens = colorForNode(node);

  const isSelected = selected || highlight === 'selected';
  const isDimmed = highlight === 'dimmed';
  const isMatch = highlight === 'match';
  const isConnected = highlight === 'connected';

  const borderColor = isSelected
    ? '#ffffff'
    : isMatch
      ? '#fbbf24'
      : isConnected
        ? tokens.ring
        : 'rgba(255,255,255,0.10)';

  return (
    <div
      aria-selected={isSelected}
      aria-label={`${filename}, ${node.language}, ${node.symbolCount} symbols`}
      role="button"
      tabIndex={0}
      className="group relative rounded-xl border transition-opacity"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: tokens.fill,
        borderColor,
        borderWidth: isSelected || isMatch ? 2 : 1,
        boxShadow: isSelected
          ? '0 8px 24px -6px rgba(0,0,0,0.5), 0 0 0 3px rgba(255,255,255,0.06)'
          : isMatch
            ? `0 0 0 3px rgba(251, 191, 36, 0.25)`
            : '0 4px 12px -6px rgba(0,0,0,0.35)',
        opacity: isDimmed ? 0.25 : 1,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: tokens.ring, width: 6, height: 6, border: 'none' }}
        isConnectable={false}
      />

      <div className="flex h-full items-center gap-2 px-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold uppercase tracking-tight"
          style={{ background: tokens.chip, color: tokens.text }}
        >
          {node.extension ?? '·'}
        </span>

        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-medium text-white/90"
            title={node.filePath}
          >
            {filename}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/45 tabular-nums">
            <span title="Symbols in file">{node.symbolCount} sym</span>
            <span className="text-white/25">·</span>
            <span title={node.language}>{tokens.label}</span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: tokens.ring, width: 6, height: 6, border: 'none' }}
        isConnectable={false}
      />
    </div>
  );
};

export const DependencyNode = memo(DependencyNodeInner);
