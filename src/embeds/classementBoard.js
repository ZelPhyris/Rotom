import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { topPogoStat } from '../db.js';

const BRAND = 0xffffff; // white
const WEB_URL = 'https://pogo-pau.mxrine-mz.dev/classement';
const fr = (v) => Number(v).toLocaleString('fr-FR');

// Custom application emojis (the bot's own medals, usable in any guild). One per
// tier; markup is <:name:id>. Names match the website's medal files.
const MEDALS = {
  experience: {
    gold: '<:experiencegold:1519255636905427014>',
    silver: '<:experiencesilver:1519255638579089458>',
    bronze: '<:experiencebronze:1519255635554734121>',
  },
  jogger: {
    gold: '<:joggergold:1519255641347063880>',
    silver: '<:joggersilver:1519255642752421908>',
    bronze: '<:joggerbronze:1519255640009080882>',
  },
  collector: {
    gold: '<:collectorgold:1519255633076027443>',
    silver: '<:collectorsilver:1519255634405752832>',
    bronze: '<:collectorbronze:1519255631633059871>',
  },
  backpacker: {
    gold: '<:backpackergold:1519255623324143676>',
    silver: '<:backpackersilver:1519255624943145091>',
    bronze: '<:backpackerbronze:1519255621830967376>',
  },
  breeder: {
    gold: '<:breedergold:1519255629045174272>',
    silver: '<:breedersilver:1519255630517506119>',
    bronze: '<:breederbronze:1519255626931372202>',
  },
};

// The ranked categories, mirroring the website's tabs. `column` matches the DB
// whitelist in topPogoStat. Niveau and XP share the "experience" medal.
export const CATEGORIES = [
  { key: 'niveau', column: 'pogo_level', label: 'Niveau', medal: 'experience', unit: (v) => `niveau **${fr(v)}**` },
  { key: 'xp', column: 'pogo_xp', label: 'XP totale', medal: 'experience', unit: (v) => `**${fr(v)}** XP` },
  { key: 'pokedex', column: 'pogo_pokedex', label: 'Captures', medal: 'collector', unit: (v) => `**${fr(v)}** capturés` },
  { key: 'distance', column: 'pogo_distance', label: 'Distance', medal: 'jogger', unit: (v) => `**${fr(v)}** km` },
  { key: 'pokestops', column: 'pogo_pokestops', label: 'PokéStops', medal: 'backpacker', unit: (v) => `**${fr(v)}** PokéStops` },
  { key: 'eggs', column: 'pogo_eggs', label: 'Œufs éclos', medal: 'breeder', unit: (v) => `**${fr(v)}** œufs éclos` },
];

const TIER = ['gold', 'silver', 'bronze']; // podium 1-2-3

// Team emojis (server emojis), shown next to each player. Keys match pogo_team.
const TEAM_EMOJI = {
  mystic: '<:team_mystic:1519021160011010241>',
  valor: '<:team_valor:1519021158484152612>',
  instinct: '<:team_instint:1519020998694015066>',
};

function buildComponents(activeKey) {
  const buttons = CATEGORIES.map((c) =>
    new ButtonBuilder()
      .setCustomId(`classement:cat:${c.key}`)
      .setLabel(c.label)
      .setEmoji(MEDALS[c.medal].gold)
      .setStyle(c.key === activeKey ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(c.key === activeKey),
  );
  const link = new ButtonBuilder()
    .setLabel('Voir sur le site')
    .setStyle(ButtonStyle.Link)
    .setURL(WEB_URL)
    .setEmoji('🌐');
  // Category buttons by rows of 3, then the link button on its own row.
  const PER_ROW = 3;
  const rows = [];
  for (let i = 0; i < buttons.length; i += PER_ROW) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + PER_ROW)));
  }
  rows.push(new ActionRowBuilder().addComponents(link));
  return rows;
}

/**
 * Build the leaderboard message for one category (embed + category buttons +
 * link to the website). Shared by the slash command and the button handler.
 * @param {string} key  one of CATEGORIES[].key
 */
export async function buildBoard(key = 'niveau') {
  const cat = CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
  const medal = MEDALS[cat.medal];
  const top = await topPogoStat(cat.column, 10);

  const lines = top.map((row, i) => {
    const rank = i < 3 ? medal[TIER[i]] : `**${i + 1}.**`;
    const team = TEAM_EMOJI[row.team] ? `   ${TEAM_EMOJI[row.team]}` : '';
    return `${rank} <@${row.discordId}> — ${cat.unit(row.value)}${team}`;
  });
  // Mini description (subtext) under the title.
  const intro = `-# Le top des dresseurs de Pau au classement **${cat.label}**.`;
  // A thin subtext rule between entries: a discreet divider, lighter than a
  // blank line.
  const body = lines.length
    ? lines.join('\n-# ──────────\n')
    : '_Aucune stat enregistrée pour le moment._\nRejoins le classement et envoie-moi une capture de ton profil en MP ! 📸';
  const description = `${intro}\n\n${body}`;

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`${medal.gold} Classement PoGo — ${cat.label}`)
    .setDescription(description)
    .setFooter({ text: 'Capture en MP pour te mettre à jour · classement complet sur le site' });

  return { embeds: [embed], components: buildComponents(cat.key), allowedMentions: { parse: [] } };
}
