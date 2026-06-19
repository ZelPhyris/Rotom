import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder } from 'discord.js';

/**
 * Shared example profile screenshot, shown to newcomers (verification embed)
 * and to classement participants (onboarding DM) so they know what to send.
 * Drop the file at assets/profil-exemple.png.
 */
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
export const EXAMPLE_FILE = 'profil-exemple.png';
const examplePath = join(ASSETS_DIR, EXAMPLE_FILE);

/** True if the example image is present in /assets. */
export function hasExampleImage() {
  return existsSync(examplePath);
}

/** An AttachmentBuilder for the example image, or null if it isn't there. */
export function exampleImageAttachment() {
  return hasExampleImage() ? new AttachmentBuilder(examplePath, { name: EXAMPLE_FILE }) : null;
}
