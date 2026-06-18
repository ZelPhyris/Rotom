import { Events } from 'discord.js';
import { config } from '../config.js';

/**
 * Language watch — Motisma reacts to swear words with a Pokémon twist.
 *  - Mild words (putain, merde…) → a fun electric-attack reply.
 *  - Stronger insults (enculé…)  → a sterner "watch your language" reminder.
 * On top of the reply, the offending member is timed out (Discord "Time out")
 * for a few seconds so they can't keep typing — no per-reply cooldown needed.
 *
 * Reading message content needs the MessageContent intent (enabled when vision
 * is configured). Timing out members needs the "Moderate Members" permission
 * and the bot's role above the target (admins/owners can't be timed out).
 */

// Word lists are written WITHOUT accents — incoming text is de-accented before
// matching, so "enculé" → "encule", "ta mère" → "ta mere", etc. Spaces in an
// entry are ignored at match time (handled like any obfuscation separator).
// Only genuine swearing here — everyday/casual words (chiant, chier, con,
// merdique…) are intentionally left out so normal venting isn't punished.
const MILD = [
  // français
  'putain', 'putin', 'ptn', 'merde', 'bordel', 'saloperie',
  // espagnol / portugais
  'mierda', 'joder', 'cono', 'porra',
  // anglais
  'shit',
  // italien / allemand
  'merda', 'scheisse', 'verdammt',
];

const STRONG = [
  // français
  'encule', 'enculer', 'pute', 'putes', 'salope', 'salopard',
  'fdp', 'fils de pute', 'nique', 'niquer', 'ntm', 'connard',
  'connasse', 'batard', 'tapette', 'pede', 'enfoire',
  // espagnol
  'puta', 'puto', 'hijo de puta', 'cabron', 'gilipollas', 'pendejo',
  'maricon', 'verga', 'polla', 'mamon',
  // anglais
  'fuck', 'fucking', 'fuckin', 'motherfucker', 'asshole', 'bastard',
  'dick', 'cunt', 'slut', 'whore', 'faggot', 'bullshit', 'bitch',
  // italien
  'cazzo', 'stronzo', 'vaffanculo', 'puttana', 'troia', 'figlio di puttana', 'coglione',
  // portugais
  'caralho', 'filho da puta', 'viado',
  // allemand
  'arschloch', 'hurensohn', 'fotze', 'wichser', 'fick dich',
  // turc / arabe (translit.) / russe (translit.)
  'orospu', 'sik', 'sharmouta', 'sharmoot', 'blyat', 'suka', 'pizdec',
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

// Leetspeak / look-alike substitutions per letter.
const LEET = {
  a: '@4', b: '8', c: '(', e: '3', g: '9', i: '1!|', l: '1|', o: '0', s: '5$', t: '7', z: '2',
};
const VOWELS = 'aeiouy';
// Symbols people use to mask a letter (almost always a vowel): "p*te", "m#rde".
const CENSOR = '*.#%';

// Optional obfuscation junk allowed BETWEEN letters: spaces and censor symbols.
// It only ever consumes separators — never letters — so real words with letters
// in between (e.g. "fait de plus" vs "fdp") can't accidentally match.
const SEP = '[\\s*._\\-]{0,4}';

// Char class for one letter: the letter, its leet variants, and — for vowels —
// generic censor symbols, so a replaced vowel ("p*te", "c0nnard") still matches.
function charClass(ch) {
  let set = ch + (LEET[ch] ?? '');
  if (VOWELS.includes(ch)) set += CENSOR;
  return `[${set.replace(/[\\\]^-]/g, '\\$&')}]`;
}

// Letters joined by optional separators → tolerant to "c-o-n", "conn*ard", etc.
function fuzzy(word) {
  return [...word.replace(/ /g, '')].map(charClass).join(SEP);
}

// Build a single word-boundary regex from a list of (de-accented) words,
// tolerant to leetspeak, censored letters and inserted separators.
function buildRegex(words) {
  return new RegExp(`(?:^|[^\\p{L}])(${words.map(fuzzy).join('|')})(?![\\p{L}])`, 'iu');
}

const STRONG_RE = buildRegex(STRONG);
const MILD_RE = buildRegex(MILD);

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (works for ñ, ç, ü, é…)
    .replace(/\s+/g, ' ');
}

async function onMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  if (!message.content) return;

  const text = normalize(message.content);
  const strong = STRONG_RE.test(text);
  const mild = !strong && MILD_RE.test(text);
  if (!strong && !mild) return;

  // Time out the member (Discord "Time out") so they can't keep typing.
  // Skipped silently for admins/owners or when the bot lacks the right perms.
  const seconds = strong ? config.languageTimeoutStrong : config.languageTimeoutMild;
  let timedOut = false;
  if (seconds > 0 && message.member?.moderatable) {
    try {
      await message.member.timeout(seconds * 1000, 'Langage inapproprié (Motisma)');
      timedOut = true;
    } catch (error) {
      console.error('[languageWatch] timeout failed:', error?.message ?? error);
    }
  }

  const base = strong ? pick(STERN_LINES) : pick(FUN_TEMPLATES)(pick(ATTACKS));
  const suffix = timedOut ? `\n*— réduit au silence ${seconds}s ⏳*` : '';
  await message.reply({ content: base + suffix, allowedMentions: { repliedUser: true } }).catch(() => {});
}

/**
 * @param {import('discord.js').Client} client
 */
export function registerLanguageWatch(client) {
  client.on(Events.MessageCreate, (message) => {
    onMessage(message).catch((e) => console.error('[languageWatch] failed:', e));
  });
}
