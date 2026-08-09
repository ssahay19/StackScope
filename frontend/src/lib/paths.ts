/**
 * Tiny path helpers used across the graph UI. Deliberately not pulling in
 * `path-browserify` — we only need two operations.
 */

export const basename = (filePath: string): string => {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(idx + 1) : filePath;
};

export const topLevelFolder = (filePath: string): string => {
  const idx = filePath.indexOf('/');
  return idx > 0 ? filePath.slice(0, idx) : '';
};
