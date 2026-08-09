import { memo } from 'react';
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

/**
 * DependencyEdge — a directed edge with three visual states:
 *   - default:   thin, translucent
 *   - highlight: brighter and thicker (when connected to a selected node)
 *   - dimmed:    barely visible
 *
 * Data:
 *   - state: 'default' | 'incoming' | 'outgoing' | 'dimmed'
 */

export type EdgeHighlightState = 'default' | 'incoming' | 'outgoing' | 'dimmed';

export interface DependencyEdgeData {
  state: EdgeHighlightState;
  [key: string]: unknown;
}

const STYLES: Record<EdgeHighlightState, { stroke: string; width: number; opacity: number }> = {
  default: { stroke: 'rgba(255,255,255,0.18)', width: 1, opacity: 0.7 },
  incoming: { stroke: '#7c5cff', width: 1.75, opacity: 1 },
  outgoing: { stroke: '#3b82f6', width: 1.75, opacity: 1 },
  dimmed: { stroke: 'rgba(255,255,255,0.10)', width: 1, opacity: 0.15 },
};

const DependencyEdgeInner = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) => {
  const state = ((data as DependencyEdgeData | undefined)?.state ?? 'default') as EdgeHighlightState;
  const style = STYLES[state];

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: style.stroke, strokeWidth: style.width, opacity: style.opacity }}
      markerEnd={markerEnd}
    />
  );
};

export const DependencyEdge = memo(DependencyEdgeInner);
