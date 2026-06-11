import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white
const fr = (n) => Number(n).toLocaleString('fr-FR');

/** A text progress bar, e.g. "▰▰▰▰▰▱▱▱▱▱▱▱". */
function progressBar(ratio, size = 12) {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

/**
 * A recap embed for a member's Pokémon GO stats. The level and its XP bar are
 * read straight from the screenshot (pogo_level + pogo_level_xp/max), so the
 * displayed numbers match the game exactly. Only known fields are shown.
 *
 * @param {import('discord.js').User} user
 * @param {string|null} ign  in-game trainer name, if known
 * @param {{ pogo_level, pogo_level_xp, pogo_level_xp_max, pogo_xp,
 *           pogo_pokedex, pogo_distance, pogo_pokestops }} stats
 */
export function buildPogoStatsEmbed(user, ign, stats) {
  const level = stats.pogo_level ?? null;
  const into = stats.pogo_level_xp != null ? Number(stats.pogo_level_xp) : null;
  const span = stats.pogo_level_xp_max != null ? Number(stats.pogo_level_xp_max) : null;

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setAuthor({ name: `Profil Pokémon GO — ${ign || user.username}`, iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 256 }));

  if (level != null) embed.setTitle(`⭐ Niveau ${level}`);

  // XP bar toward the next level, straight from the screenshot's "x / y" pair.
  if (into != null && span != null && span > 0) {
    const ratio = Math.min(1, into / span);
    const pct = Math.round(ratio * 100);
    const toNext = Math.max(0, span - into);
    const nextLabel = level != null ? `vers le niveau ${level + 1}` : 'vers le niveau suivant';
    embed.setDescription(
      `${progressBar(ratio)}  **${pct}%**\n` +
        `${fr(into)} / ${fr(span)} XP ${nextLabel}  ·  encore **${fr(toNext)}** XP`,
    );
  }

  const fields = [];
  if (stats.pogo_xp != null) fields.push({ name: '✨ Total XP', value: fr(stats.pogo_xp), inline: true });
  if (stats.pogo_pokedex != null) fields.push({ name: '🔴 Pokémon capturés', value: fr(stats.pogo_pokedex), inline: true });
  if (stats.pogo_distance != null) fields.push({ name: '👟 Distance', value: `${fr(stats.pogo_distance)} km`, inline: true });
  if (stats.pogo_pokestops != null) fields.push({ name: '🛑 PokéStops visités', value: fr(stats.pogo_pokestops), inline: true });
  if (fields.length) embed.addFields(fields);

  embed.setFooter({ text: 'Classement : /classement-pogo voir' });
  return embed;
}
