interface HierarchyItem {
  id: number;
  parent: number;
}

export type HierarchyNode<T> = T & { children: HierarchyNode<T>[] };

function hasValidAncestors(parents: ReadonlyMap<number, number>, start: number, excludedId?: number): boolean {
  const visited = new Set<number>();
  let current = start;
  while (current !== 0) {
    if (current === excludedId || visited.has(current)) return false;
    visited.add(current);
    const parent = parents.get(current);
    if (parent === undefined) return false;
    current = parent;
  }
  return true;
}

export function getValidParentOptions<T extends HierarchyItem>(items: T[], editingId?: number): T[] {
  const parents = new Map(items.map((item) => [item.id, item.parent]));
  return items.filter((item) => hasValidAncestors(parents, item.id, editingId));
}

export function buildHierarchy<T extends HierarchyItem>(items: T[]): HierarchyNode<T>[] {
  const parents = new Map(items.map((item) => [item.id, item.parent]));
  const nodes = new Map<number, HierarchyNode<T>>(items.map((item) => [item.id, { ...item, children: [] }]));
  const roots: HierarchyNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parent);
    if (parent && hasValidAncestors(parents, node.id)) parent.children.push(node);
    // Show invalid chains as roots so administrators can still find and repair every item.
    else roots.push(node);
  }
  return roots;
}
