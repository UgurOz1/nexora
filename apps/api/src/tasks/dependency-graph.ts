// Task dependencies form a directed graph: an edge "A -> B" means "A waits for B".
// The graph must never contain a cycle (A waits for B, B waits for A: nobody could ever start).

export interface DependencyEdge {
  taskId: string;
  dependsOnId: string;
}

// task -> the tasks it waits for
export type DependencyGraph = ReadonlyMap<string, readonly string[]>;

export function buildGraph(edges: readonly DependencyEdge[]): DependencyGraph {
  const graph = new Map<string, string[]>();
  for (const { taskId, dependsOnId } of edges) {
    const targets = graph.get(taskId);
    if (targets) {
      targets.push(dependsOnId);
    } else {
      graph.set(taskId, [dependsOnId]);
    }
  }
  return graph;
}

// Depth-first search from `from` along "waits for" edges. Returns the path [from, ..., to] or
// null if `to` cannot be reached. Every node is visited at most once, so it runs in O(V + E).
// It is iterative on purpose: a long dependency chain must not overflow the call stack.
export function findPath(graph: DependencyGraph, from: string, to: string): string[] | null {
  const cameFrom = new Map<string, string | null>([[from, null]]);
  const stack = [from];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === to) {
      const path: string[] = [];
      for (let at: string | null = node; at !== null; at = cameFrom.get(at) ?? null) {
        path.push(at);
      }
      return path.reverse();
    }
    for (const next of graph.get(node) ?? []) {
      if (!cameFrom.has(next)) {
        cameFrom.set(next, node);
        stack.push(next);
      }
    }
  }
  return null;
}

// Adding "taskId waits for dependsOnId" closes a cycle exactly when dependsOnId already waits
// (directly or through others) for taskId. Returns the cycle as [taskId, dependsOnId, ..., taskId],
// or null when the new edge is safe.
export function findCycleIfAdded(
  graph: DependencyGraph,
  taskId: string,
  dependsOnId: string,
): string[] | null {
  if (taskId === dependsOnId) {
    return [taskId, taskId];
  }
  const path = findPath(graph, dependsOnId, taskId);
  return path ? [taskId, ...path] : null;
}
