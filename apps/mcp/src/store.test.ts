import { describe, it, expect } from 'vitest';
import { MemoryStore } from './store.js';

const OWNER = '0x' + 'ab'.repeat(32);
const mk = () => new MemoryStore(':memory:', OWNER);

describe('MemoryStore.remember', () => {
  it('inserts a node, then upserts (version bump) on same title', () => {
    const s = mk();
    const a = s.remember({ title: 'Project Atlas', body: 'v1', type: 'project' });
    expect(a.version).toBe(1);
    expect(a.owner).toBe(OWNER);
    const b = s.remember({ title: 'Project Atlas', body: 'v2', type: 'project' });
    expect(b.id).toBe(a.id);
    expect(b.version).toBe(2);
    expect(b.body).toBe('v2');
    expect(s.allNodes().length).toBe(1);
  });

  it('links by title to existing nodes', () => {
    const s = mk();
    s.remember({ title: 'Project Atlas', body: '', type: 'project' });
    s.remember({ title: 'TypeScript', body: '', type: 'skill', links: [{ to: 'Project Atlas', rel: 'uses' }] });
    expect(s.allEdges().length).toBe(1);
    expect(s.allEdges()[0]!.rel).toBe('uses');
  });
});

describe('MemoryStore.recall', () => {
  it('ranks lexical matches and expands the neighborhood', () => {
    const s = mk();
    s.remember({ title: 'Project Atlas', body: 'local-first memory platform', type: 'project', tags: ['atlas'] });
    s.remember({ title: 'TypeScript', body: 'language', type: 'skill', links: [{ to: 'Project Atlas', rel: 'uses' }] });
    s.remember({ title: 'Unrelated Recipe', body: 'pasta', type: 'concept' });

    const r = s.recall('atlas', 1);
    const titles = r.nodes.map((n) => n.title);
    // matched root + its neighbor included; unrelated excluded
    expect(titles).toContain('Project Atlas');
    expect(titles).toContain('TypeScript'); // 1-hop neighbor of the match
    expect(titles).not.toContain('Unrelated Recipe');
    // the lexical match scores highest
    const top = [...r.nodes].sort((a, b) => b.score - a.score)[0]!;
    expect(top.title).toBe('Project Atlas');
    expect(top.score).toBeGreaterThan(0);
  });

  it('depth 0 returns only the matched root (no neighbors)', () => {
    const s = mk();
    s.remember({ title: 'Project Atlas', body: '', type: 'project' });
    s.remember({ title: 'TypeScript', body: '', type: 'skill', links: [{ to: 'Project Atlas', rel: 'uses' }] });
    const r = s.recall('atlas', 0);
    expect(r.nodes.map((n) => n.title)).toEqual(['Project Atlas']);
  });
});
