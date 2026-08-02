import fs from "fs";
import path from "path";

export interface DirNode {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children: DirNode[];
}

export interface FlatRow {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
}

const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "bun.lock",
  "package-lock.json",
]);

function shouldSkip(name: string): boolean {
  return SKIP.has(name);
}

function listDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readChildren(
  abs: string,
  root: string,
  depth: number,
  maxDepth: number,
): DirNode[] {
  if (depth >= maxDepth) return [];

  return listDir(abs)
    .filter((entry) => !shouldSkip(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((entry) => {
      const childAbs = path.join(abs, entry.name);
      const relativePath = path.relative(root, childAbs) || entry.name;
      const isDirectory = entry.isDirectory();
      return {
        name: entry.name,
        relativePath,
        isDirectory,
        children: isDirectory
          ? readChildren(childAbs, root, depth + 1, maxDepth)
          : [],
      };
    });
}

export function readProjectTree(root: string, maxDepth = 4): DirNode {
  const rootName = path.basename(root) || root;
  return {
    name: rootName,
    relativePath: ".",
    isDirectory: true,
    children: readChildren(root, root, 1, maxDepth),
  };
}

export function flattenVisible(
  root: DirNode,
  expanded: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = [];

  const walk = (node: DirNode, depth: number) => {
    const isExpanded = expanded.has(node.relativePath);
    const hasChildren = node.isDirectory && node.children.length > 0;
    rows.push({
      name: node.name,
      relativePath: node.relativePath,
      isDirectory: node.isDirectory,
      depth,
      expanded: isExpanded,
      hasChildren,
    });
    if (node.isDirectory && isExpanded) {
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }
  };

  walk(root, 0);
  return rows;
}

export function formatTreePrefix(row: FlatRow): string {
  const indent = "  ".repeat(row.depth);
  if (!row.isDirectory) return `${indent}· `;
  if (!row.hasChildren) return `${indent}· `;
  return `${indent}${row.expanded ? "▾ " : "▸ "}`;
}

export function defaultExpanded(root: DirNode): Set<string> {
  // Root + first-level directories open; deeper stays collapsed.
  const set = new Set<string>(["."]);
  for (const child of root.children) {
    if (child.isDirectory) {
      set.add(child.relativePath);
    }
  }
  return set;
}
