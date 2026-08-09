import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Jsdom lacks a few APIs that @xyflow/react touches at import time.
 * These shims are enough for our unit-level tests; the graph component tests
 * that need real layout run against a minimal happy-path fixture.
 */

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// DOMRect wasn't exposed in older jsdom versions; guard against absence.
if (typeof globalThis.DOMRect === 'undefined') {
  (globalThis as unknown as { DOMRect: unknown }).DOMRect = class {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    top = 0;
    right = 0;
    bottom = 0;
    left = 0;
    static fromRect() {
      return new (globalThis as { DOMRect: { new (): unknown } }).DOMRect();
    }
    toJSON() {
      return {};
    }
  };
}

afterEach(() => {
  cleanup();
});
