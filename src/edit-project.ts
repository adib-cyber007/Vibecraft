import type { Project } from './model';
import { assertProjectEdit } from './validation';

/** Retain identities for unchanged branches after editing an isolated draft. */
function reconcile(previous: unknown, next: unknown): unknown {
  if (previous === next) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next;
  if (Array.isArray(previous) !== Array.isArray(next)) return next;
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>;
  const keys = Object.keys(after); let same = keys.length === Object.keys(before).length;
  for (const key of keys) { after[key] = reconcile(before[key], after[key]); if (after[key] !== before[key] || !(key in before)) same = false; }
  return same ? previous : next;
}

export function editProject(previous: Project, change: (draft: Project) => void): Project {
  const draft = structuredClone(previous);
  change(draft);
  // Geometry/limits are checked without decoding unchanged media on pointer moves.
  draft.updatedAt = new Date().toISOString();
  const result=reconcile(previous,draft) as Project;
  assertProjectEdit(previous,result);
  return result;
}
