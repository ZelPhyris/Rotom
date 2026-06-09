import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countBySector } from './sectors.js';
import { MIN_VISIBLE_PLAYERS } from '../config/sectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COUNTS_FILE = join(__dirname, '..', '..', 'app', 'counts.json');

/**
 * Build the public counts payload consumed by the interactive web map.
 * Only aggregated per-sector numbers are exposed — never member identities.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ updatedAt: string, minVisiblePlayers: number, sectors: Record<string, number> }>}
 */
export async function buildCounts(guild) {
  const rows = await countBySector(guild);
  return {
    updatedAt: new Date().toISOString(),
    minVisiblePlayers: MIN_VISIBLE_PLAYERS,
    sectors: Object.fromEntries(rows.map((r) => [r.name, r.count])),
  };
}

/**
 * Write app/counts.json so the static map picks up fresh numbers.
 * Publish it to the web root (see deploy/) from a scheduled job.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<string>} absolute path of the file written
 */
export async function writeCounts(guild) {
  const payload = await buildCounts(guild);
  await writeFile(COUNTS_FILE, JSON.stringify(payload, null, 2) + '\n');
  return COUNTS_FILE;
}
