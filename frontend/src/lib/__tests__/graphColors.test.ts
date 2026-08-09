import { describe, expect, it } from 'vitest';
import { colorForNode, LEGEND_ORDER } from '../graphColors';

describe('graphColors — colorForNode', () => {
  it('picks TypeScript blue for source TS files', () => {
    expect(colorForNode({ category: 'source', language: 'TypeScript' }).key).toBe('typescript');
  });

  it('picks JavaScript yellow for source JS files', () => {
    expect(colorForNode({ category: 'source', language: 'JavaScript' }).key).toBe('javascript');
  });

  it('overrides language when the category is test', () => {
    expect(colorForNode({ category: 'test', language: 'TypeScript' }).key).toBe('test');
  });

  it('overrides language when the category is config', () => {
    expect(colorForNode({ category: 'config', language: 'TypeScript' }).key).toBe('config');
  });

  it('picks green for JSON/data files', () => {
    expect(colorForNode({ category: 'data', language: 'JSON' }).key).toBe('data');
  });

  it('picks gray for markdown/docs', () => {
    expect(colorForNode({ category: 'documentation', language: 'MD' }).key).toBe('documentation');
  });

  it('falls back to "other" for unknown source languages', () => {
    expect(colorForNode({ category: 'source', language: 'Fortran' }).key).toBe('other');
  });
});

describe('graphColors — legend order', () => {
  it('exposes all core categories in the legend', () => {
    const keys = LEGEND_ORDER.map((e) => e.key);
    expect(keys).toContain('typescript');
    expect(keys).toContain('javascript');
    expect(keys).toContain('config');
    expect(keys).toContain('test');
    expect(keys).toContain('data');
    expect(keys).toContain('documentation');
  });
});
