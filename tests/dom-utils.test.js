import { describe, it, expect } from 'vitest';
import { escapeHtml, shortRef } from '../shared/dom-utils.js';

/* ── escapeHtml ── */

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes all special chars together', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('coerces non-string values', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

/* ── shortRef ── */

describe('shortRef', () => {
  it('strips refs/heads/ prefix', () => {
    expect(shortRef('refs/heads/main')).toBe('main');
  });

  it('strips prefix from nested branch names', () => {
    expect(shortRef('refs/heads/feature/my-branch')).toBe('feature/my-branch');
  });

  it('returns non-prefixed refs unchanged', () => {
    expect(shortRef('main')).toBe('main');
  });

  it('handles empty string', () => {
    expect(shortRef('')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(shortRef(null)).toBe('');
    expect(shortRef(undefined)).toBe('');
  });
});
