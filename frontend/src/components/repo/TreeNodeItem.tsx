import { memo, useCallback, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TreeNode } from '../../types/repository';

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  defaultExpanded?: boolean;
  selectedPath?: string | null;
  onFileSelect?: (path: string) => void;
}

const formatBytes = (bytes: number | undefined): string => {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform duration-200 ${
      open ? 'rotate-90 text-white/70' : ''
    }`}
  >
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-accent-soft/80">
    {open ? (
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v.5H5l-2 8V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ) : (
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

const FileIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-white/40">
    <path
      d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const TreeNodeItemInner = ({
  node,
  depth,
  defaultExpanded = false,
  selectedPath,
  onFileSelect,
}: TreeNodeItemProps) => {
  const isFolder = node.type === 'folder';
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const isSelected = !isFolder && selectedPath === node.path;

  const activate = useCallback(() => {
    if (isFolder) {
      setExpanded((v) => !v);
    } else if (onFileSelect) {
      onFileSelect(node.path);
    }
  }, [isFolder, node.path, onFileSelect]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
      return;
    }
    if (!isFolder) return;
    if (e.key === 'ArrowRight' && !expanded) {
      e.preventDefault();
      setExpanded(true);
    } else if (e.key === 'ArrowLeft' && expanded) {
      e.preventDefault();
      setExpanded(false);
    }
  };

  const indent = { paddingLeft: `${depth * 14 + 8}px` };

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={isFolder ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        onClick={activate}
        onKeyDown={onKeyDown}
        className={[
          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
          isSelected
            ? 'bg-accent/15 text-white'
            : 'hover:bg-white/[0.03] focus-visible:bg-white/[0.05]',
          isFolder || onFileSelect ? 'cursor-pointer' : 'cursor-default',
        ].join(' ')}
        style={indent}
      >
        {isFolder ? <ChevronIcon open={expanded} /> : <span className="w-3.5" aria-hidden />}
        {isFolder ? <FolderIcon open={expanded} /> : <FileIcon />}

        <span className="truncate text-white/85">{node.name || '/'}</span>

        {!isFolder && node.extension ? (
          <span className="ml-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/40">
            {node.extension}
          </span>
        ) : null}

        {isFolder && node.children ? (
          <span className="ml-auto text-xs text-white/35 tabular-nums">
            {node.children.length}
          </span>
        ) : null}
        {!isFolder ? (
          <span className="ml-auto text-xs text-white/35 tabular-nums">{formatBytes(node.size)}</span>
        ) : null}
      </div>

      {isFolder && node.children && node.children.length > 0 ? (
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.ul
              role="group"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {node.children.map((child) => (
                <TreeNodeItem
                  key={`${child.type}:${child.path}`}
                  node={child}
                  depth={depth + 1}
                  selectedPath={selectedPath ?? null}
                  onFileSelect={onFileSelect}
                />
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      ) : null}
    </li>
  );
};

export const TreeNodeItem = memo(TreeNodeItemInner);
