import { Events } from 'discord.js';

/**
 * Language watch — Motisma reacts to swear words with a Pokémon twist.
 *  - Mild words (putain, merde…) → a fun electric-attack reply.
 *  - Stronger insults (enculé…)  → a sterner "watch your language" reminder.
 *
 * Reading message content needs the MessageContent intent (enabled when vision
 * is configured). A per-user cooldown avoids spamming the channel.
 */

// Word lists are written WITHOUT accents — incoming text is de-accented before
// matching, so "enculé" → "encule", "ta mère" → "ta mere", etc.
const MILD = [
  'putain', 'putin', 'ptn', 'merde', 'merdique', 'bordel', 'chier', 'chiant',
  'fait chier', 'con', 'conne', 'connerie', 'saloperie',
];

const STRONG = [
  'encule', 'enculer', 'pute', 'putes', 'salope', 'salopard',
  'fdp', 'fils de pute', 'nique', 'niquer', 'ntm', 'connard',
  'connasse', 'batard', 'tapette', 'pede', 'enfoire',
];

// Electric attack names (French Pokémon GO) used in the fun replies.
const ATTACKS = [
  'Éclair', 'Tonnerre', 'Cage-Éclair', 'Étincelle', 'Boule Élek', 'Coup d’Jus',
  'Élécanon', 'Lance-Tonnerre', 'Vibrélectrik',
];

const FUN_TEMPLATES = [
  (a) => `⚡ Bzzt ! Motisma t’envoie un coup de **${a}** pour surveiller ton langage ! 😄`,
  (a) => `⚡ **${a}** ! Doucement sur les gros mots, dresseur. 😏`,
  (a) => `⚡ Motisma lance **${a}** : on reste poli sur le serveur !`,
  (a) => `⚡ Zzzt ! Un petit **${a}** pour calmer ce vocabulaire. 🔌`,
];

const STERN_LINES = [
  '⚡ Là c’est trop. **Attention à ton langage.** Motisma veille. 😠',
  '⚡ Motisma charge une **Fatal-Foudre**… surveille ton vocabulaire, sérieusement.',
  '⚡ Ce mot-là ne passe pas. **Reste correct** ou Motisma se charge de te recadrer. ⚡😠',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a single word-boundary regex from a list of (de-accented) words.
function buildRegex(words) {
  return new RegExp(`(?:^|[^\\p{L}])(${words.map(escapeRegex).join('|')})(?![\\p{L}])`, 'iu');
}

const STRONG_RE = buildRegex(STRONG);
const MILD_RE = buildRegex(MILD);

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/\s+/g, ' ');
}

const COOLDOWN_MS = 20_000;
const lastReply = new Map(); // userId -> timestamp

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  if (!message.content) return;

  const text = normalize(message.content);
  const strong = STRONG_RE.test(text);
  const mild = !strong && MILD_RE.test(text);
  if (!strong && !mild) return;

  const now = Date.now();
  const last = lastReply.get(message.author.id) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastReply.set(message.author.id, now);

  const reply = strong ? pick(STERN_LINES) : pick(FUN_TEMPLATES)(pick(ATTACKS));
  await message.reply({ content: reply, allowedMentions: { repliedUser: true } }).catch(() => {});
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerLanguageWatch(client) {
  client.on(Events.MessageCreate, (message) => {
    onMessage(message).catch((e) => console.error('[languageWatch] failed:', e));
  });
}
