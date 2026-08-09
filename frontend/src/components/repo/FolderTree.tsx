import { GlassCard } from '../ui/GlassCard';
import { TreeNodeItem } from './TreeNodeItem';
import type { TreeNode } from '../../types/repository';

interface FolderTreeProps {
  tree: TreeNode;
  selectedPath?: string | null;
  onFileSelect?: (path: string) => void;
}

/**
 * FolderTree
 *
 * Renders the repo root and its immediate children expanded by default,
 * then leaves everything deeper collapsed. This gives users a scannable
 * overview without exploding the DOM on large repositories.
 */
export const FolderTree = ({ tree, selectedPath, onFileSelect }: FolderTreeProps) => {
  const rootChildren = tree.children ?? [];

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white/90">Repository structure</h2>
        <span className="text-xs text-white/40">
          {rootChildren.length} top-level {rootChildren.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <ul
        role="tree"
        aria-label={`File tree for ${tree.name}`}
        className="mt-4 max-h-[560px] overflow-y-auto pr-1"
      >
        {rootChildren.map((child) => (
          <TreeNodeItem
            key={`${child.type}:${child.path}`}
            node={child}
            depth={0}
            defaultExpanded={false}
            selectedPath={selectedPath ?? null}
            onFileSelect={onFileSelect}
          />
        ))}
      </ul>
    </GlassCard>
  );
};
