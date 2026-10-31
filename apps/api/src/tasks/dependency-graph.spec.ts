import { buildGraph, findCycleIfAdded, findPath } from './dependency-graph';

// "a -> b" in a test name reads "a waits for b".
const graphOf = (...pairs: [string, string][]) =>
  buildGraph(pairs.map(([taskId, dependsOnId]) => ({ taskId, dependsOnId })));

describe('findCycleIfAdded', () => {
  it('allows an edge in an empty graph', () => {
    expect(findCycleIfAdded(graphOf(), 'a', 'b')).toBeNull();
  });

  it('rejects a task that waits for itself', () => {
    expect(findCycleIfAdded(graphOf(), 'a', 'a')).toEqual(['a', 'a']);
  });

  it('rejects the direct reverse edge (a -> b exists, adding b -> a)', () => {
    expect(findCycleIfAdded(graphOf(['a', 'b']), 'b', 'a')).toEqual(['b', 'a', 'b']);
  });

  it('rejects a cycle through several tasks and reports the loop', () => {
    const graph = graphOf(['a', 'b'], ['b', 'c'], ['c', 'd']);

    // d -> a would close a -> b -> c -> d -> a
    expect(findCycleIfAdded(graph, 'd', 'a')).toEqual(['d', 'a', 'b', 'c', 'd']);
  });

  it('allows edges that merely share tasks (a diamond is not a cycle)', () => {
    const graph = graphOf(['a', 'b'], ['a', 'c'], ['b', 'd']);

    expect(findCycleIfAdded(graph, 'c', 'd')).toBeNull();
  });

  it('allows an edge between unrelated components and a long one-way chain', () => {
    const graph = graphOf(['a', 'b'], ['b', 'c'], ['x', 'y']);

    expect(findCycleIfAdded(graph, 'c', 'x')).toBeNull();
    expect(findCycleIfAdded(graph, 'a', 'c')).toBeNull(); // a shortcut, still acyclic
  });

  it('terminates on a graph that already contains a cycle elsewhere', () => {
    const graph = graphOf(['p', 'q'], ['q', 'p']);

    expect(findCycleIfAdded(graph, 'a', 'b')).toBeNull();
    expect(findCycleIfAdded(graph, 'a', 'p')).toBeNull();
  });

  it('handles a very long chain without overflowing the stack', () => {
    const length = 50_000;
    const edges: [string, string][] = Array.from({ length }, (_, i) => [`t${i}`, `t${i + 1}`]);
    const graph = graphOf(...edges);

    const cycle = findCycleIfAdded(graph, `t${length}`, 't0');

    expect(cycle).toHaveLength(length + 2);
    expect(findCycleIfAdded(graph, 't0', `t${length}`)).toBeNull();
  });
});

describe('findPath', () => {
  it('returns the path between two tasks, or null', () => {
    const graph = graphOf(['a', 'b'], ['b', 'c'], ['a', 'x']);

    expect(findPath(graph, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(findPath(graph, 'c', 'a')).toBeNull();
    expect(findPath(graph, 'a', 'a')).toEqual(['a']);
  });
});
