/**
 * Bounded parallel map.
 *
 * `mapWithConcurrency(items, limit, fn)` runs at most `limit` invocations of
 * `fn` at a time and returns results in the same order as `items`. Errors
 * thrown by `fn` are caught per-item and passed to `onError`; a failed item
 * yields `undefined` so callers can filter it out.
 *
 * This is intentionally tiny — a full-featured library (`p-limit`, `p-map`)
 * would be overkill for one caller.
 */

export interface MapOptions<T> {
  onError?: (err: unknown, item: T, index: number) => void;
}

export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options: MapOptions<T> = {},
): Promise<Array<R | undefined>> => {
  const results: Array<R | undefined> = new Array(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i]!;
      try {
        results[i] = await fn(item, i);
      } catch (err) {
        results[i] = undefined;
        options.onError?.(err, item, i);
      }
    }
  };

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
};
