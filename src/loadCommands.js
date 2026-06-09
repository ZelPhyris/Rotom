import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recursively collect every .js command file under `dir` (including
 * subfolders like commands/administration/).
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
export function collectCommandPaths(dir) {
  const paths = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...collectCommandPaths(full));
    else if (entry.name.endsWith('.js')) paths.push(full);
  }
  return paths;
}
