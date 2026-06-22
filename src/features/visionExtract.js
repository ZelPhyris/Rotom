import { GoogleGenAI } from '@google/genai';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config } from '../config.js';

/**
 * Reads a Pokémon GO profile screenshot with Google Gemini (free tier) and
 * extracts the trainer name. Dormant if GEMINI_API_KEY is not configured.
 */
const ai = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;

export function hasVision() {
  return ai !== null;
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Detect the team from the screenshot's COLOURS — deterministic and far more
 * reliable than asking the model to judge a colour. The team theme tints the
 * whole profile banner, so the dominant vivid hue (blue/red/yellow) is the team.
 * Only vivid pixels count (pastel shirts, white, grey, skin are ignored), and a
 * clear winner is required, otherwise null (fall back to the model's guess).
 * @returns {Promise<'mystic'|'valor'|'instinct'|null>}
 */
async function detectTeamColor(buffer) {
  try {
    const img = await loadImage(buffer);
    const w = 160;
    const h = Math.max(1, Math.round((img.height / img.width) * w));
    const ctx = createCanvas(w, h).getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    let red = 0;
    let blue = 0;
    let yellow = 0;
    for (let i = 0; i < data.length; i += 4) {
      const { h: hue, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (s < 0.45 || v < 0.35) continue; // skip washed-out / dark pixels
      if (hue <= 18 || hue >= 338) red++; // red & pink (Valor theme)
      else if (hue >= 40 && hue <= 70) yellow++; // yellow & gold (Instinct)
      else if (hue >= 192 && hue <= 255) blue++; // blue (Mystic)
    }

    const ranked = [
      ['valor', red],
      ['mystic', blue],
      ['instinct', yellow],
    ].sort((a, b) => b[1] - a[1]);
    const total = red + blue + yellow;
    // Need enough vivid coloured pixels and a clear margin over the runner-up.
    if (total < w * h * 0.012) return null;
    if (ranked[0][1] < ranked[1][1] * 1.4) return null;
    return ranked[0][0];
  } catch {
    return null; // unsupported format / decode error → let the model decide
  }
}

// A 429 means the model is out of quota/credit (free-tier daily cap reached, or
// prepaid credits depleted). It won't recover quickly → switch to another model.
const isQuota = (error) => error?.status === 429;

// Each Gemini model has its OWN free-tier daily quota (≈20/day), so trying the
// next model when one is exhausted multiplies the free allowance. The configured
// VISION_MODEL is tried first, then a fallback chain.
const MODEL_CHAIN = [
  ...new Set(
    [
      config.visionModel,
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ].filter(Boolean),
  ),
];

// Retry only genuine transient server errors (503 high demand / 500). A 429
// (quota/credit) is handled one level up by switching model, not by retrying.
async function generateWithRetry(params, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      const transient = error?.status === 503 || error?.status === 500;
      if (!transient || i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // 1s,2s,3s,4s
    }
  }
}

// Try the model chain in order; move to the next model on a quota/credit 429.
async function generateAcrossModels(contents, genConfig) {
  let lastError;
  for (const model of MODEL_CHAIN) {
    try {
      return await generateWithRetry({ model, contents, config: genConfig });
    } catch (error) {
      lastError = error;
      if (isQuota(error)) continue; // this model is out of quota — try the next
      throw error; // a non-quota error: stop and surface it
    }
  }
  console.error('[vision] Tous les modèles Gemini sont à court de quota/crédit — lecture indisponible (recharge un crédit ou attends le reset quotidien).');
  throw lastError;
}

// A single prompt reads EVERYTHING (name, code, stats, team, authenticity) so we
// spend only one Gemini request per image — important on the free tier.
const STATS_PROMPT = [
  'Tu lis une capture d’écran Pokémon GO (écran de profil, "Ajouter un ami" ou liste de statistiques).',
  'Extrais chaque valeur UNIQUEMENT si elle est clairement visible sur l’image :',
  '- "trainer_name" : le PSEUDO du dresseur. Sur le profil, c’est le grand texte EN HAUT, au-dessus du niveau et à côté de l’avatar. Sur l’écran "Ajouter un ami", c’est le nom juste au-dessus du code ami. Transcris-le EXACTEMENT, caractère par caractère (majuscules/minuscules, accents, chiffres et symboles). Ne traduis pas, n’invente pas, n’ajoute aucun espace. Même si l’image est floue ou sombre, fais de ton mieux pour le déchiffrer.',
  '- "friend_code" : le code ami à 12 chiffres (souvent écrit "1234 5678 9012").',
  '- "level" : le grand nombre sous le mot "NIVEAU", près de l’avatar (un entier, ex. 38, 50, 51…). Lis-le tel quel, ne le plafonne pas.',
  '- "level_xp_current" : à côté du niveau, le nombre AVANT le "/" dans la barre d’XP (XP dans le niveau actuel, ex. "654 012 / 1 580 000" → 654012).',
  '- "level_xp_needed" : dans cette même barre, le nombre APRÈS le "/" (XP requis pour ce niveau, ex. "654 012 / 1 580 000" → 1580000).',
  '- "total_xp" : le "Total de PX" / "Total XP" cumulé, dans la liste de statistiques (un grand nombre, ex. "14 847 012").',
  '- "caught" : "Pokémon capturés" / "Pokémon attrapés" (un entier).',
  '- "distance_km" : "Distance parcourue" / "Distance marchée" en kilomètres (un nombre décimal, ex. "376,3 km" → 376.3).',
  '- "pokestops" : "PokéStops visités" (un entier).',
  '- "eggs_hatched" : le nombre total d’ŒUFS ÉCLOS, visible sur le badge/médaille "Œufs éclos" (médaille Éleveur) ou dans les statistiques. Un entier.',
  '- "team" : l’ÉQUIPE du joueur. Indices, dans l’ordre : (a) la couleur du numéro de niveau et de la barre de progression — BLEU → "mystic", ROUGE → "valor", JAUNE → "instinct". (b) ATTENTION : aux niveaux élevés (40+), cet anneau/barre devient DORÉ ou argenté (prestige) — ce n’est PAS la couleur de l’équipe, ne le prends pas pour du jaune Intuition. Dans ce cas, fie-toi à l’emblème d’équipe ou à tout autre élément nettement coloré : Sagesse/mystic = BLEU (oiseau Artikodin), Bravoure/valor = ROUGE (Sulfura), Intuition/instinct = JAUNE (Électhor). Réponds "mystic", "valor" ou "instinct" ; si vraiment indéterminable, mets "".',
  'Ignore les séparateurs de milliers (espaces, points, virgules). La virgule décimale du km devient un point.',
  '',
  'AUTHENTICITÉ — ne signale QUE les fraudes ÉVIDENTES. Une capture de téléphone est presque toujours compressée (JPEG) : le flou léger, le bruit, les artefacts de compression autour du texte, la faible résolution et les espaces séparateurs de milliers sont NORMAUX et ne sont JAMAIS de la retouche.',
  '- "is_pogo_screenshot" : true si l’interface ressemble à Pokémon GO (profil, statistiques…). Dans le moindre doute, mets true.',
  '- "tampering_suspected" : true UNIQUEMENT si un nombre a visiblement été RÉÉCRIT ou COLLÉ : police nettement différente du reste de l’interface, chiffres d’une autre taille/couleur que les libellés voisins, rectangle de fond collé derrière un nombre, chiffres qui se chevauchent ou clairement désalignés. Si l’image est simplement floue, compressée ou de mauvaise qualité, ce n’est PAS de la retouche. En cas de doute, mets TOUJOURS false.',
  '- "tampering_reason" : si (et seulement si) tampering_suspected vaut true, une courte explication précise en français (ex. "le Total XP est dans une police différente du reste"). Sinon "".',
  '',
  'Réponds STRICTEMENT en JSON : {"trainer_name": string, "friend_code": string, "level": number, "level_xp_current": number, "level_xp_needed": number, "total_xp": number, "caught": number, "distance_km": number, "pokestops": number, "eggs_hatched": number, "team": string, "is_pogo_screenshot": boolean, "tampering_suspected": boolean, "tampering_reason": string}.',
  'Mets 0 (ou 0.0 pour la distance, "" pour les textes) pour toute valeur que tu ne vois pas. N’invente jamais une valeur.',
].join('\n');

/** Fetch an image URL and return { data: base64, mimeType }. */
async function fetchImage(imageUrl) {
  const res = await fetch(imageUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png';
  return { data: buffer.toString('base64'), mimeType, buffer };
}

/**
 * Extract the trainer name and/or 12-digit friend code from a screenshot.
 * Thin wrapper over extractStats (single Gemini call reads everything).
 * @param {string} imageUrl  publicly fetchable image URL (e.g. a Discord attachment)
 * @returns {Promise<{ trainerName: string|null, friendCode: string|null }>}
 */
export async function extractProfile(imageUrl) {
  const { trainerName, friendCode } = await extractStats(imageUrl);
  return { trainerName, friendCode };
}

// Default authenticity verdict: trust the image (no rejection) when vision is
// off or errors out — so an API hiccup never wrongly flags an honest member.
const TRUSTED = { isPogo: true, suspected: false, certain: false, reason: '' };

const EMPTY_STATS = {
  trainerName: null,
  friendCode: null,
  level: null,
  levelXp: null,
  levelXpMax: null,
  xp: null,
  pokedex: null,
  distance: null,
  pokestops: null,
  eggs: null,
  team: null,
  authenticity: TRUSTED,
};

const TEAMS = new Set(['mystic', 'valor', 'instinct']);

// Strip thousands separators (spaces/dots) and round to an integer > 0, else null.
function toInt(v) {
  const cleaned = String(v ?? '').replace(/[^\d]/g, '');
  const n = Math.round(Number(cleaned));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Parse a km distance: tolerate "1 234,5" (FR) and "1,234.5" (EN) → 1234.5.
function toKm(v) {
  let s = String(v ?? '').replace(/[^\d.,]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // The last separator is the decimal one; the other groups thousands.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
}

/**
 * Extract Pokémon GO stats from a profile/stats screenshot.
 * Absent or implausible values come back null.
 * @param {string} imageUrl
 * @returns {Promise<{ level: number|null, xp: number|null, pokedex: number|null,
 *   distance: number|null, pokestops: number|null }>}
 */
export async function extractStats(imageUrl) {
  if (!ai) return { ...EMPTY_STATS };

  try {
    const { data, mimeType, buffer } = await fetchImage(imageUrl);
    // Pixel-based team detection runs in parallel with the model call (it's the
    // reliable source for the team; the model's guess is only a fallback).
    const colorTeamPromise = detectTeamColor(buffer);
    const response = await generateAcrossModels(
      [{ inlineData: { mimeType, data } }, { text: STATS_PROMPT }],
      { responseMimeType: 'application/json' },
    );

    const text = response.text;
    if (!text) return { ...EMPTY_STATS, team: await colorTeamPromise };

    const parsed = JSON.parse(text);
    const lvl = toInt(parsed.level);
    const xpCur = toInt(parsed.level_xp_current);
    const xpMax = toInt(parsed.level_xp_needed);
    const trainerName = String(parsed.trainer_name ?? '').trim() || null;
    const fcDigits = String(parsed.friend_code ?? '').replace(/\D/g, '');
    const friendCode = fcDigits.length === 12 ? fcDigits : null;

    // Deterministic sanity checks: some values are physically impossible in
    // Pokémon GO, so they prove the image was edited no matter what the AI
    // tampering analysis concludes. (Trainer level caps at 80; a margin is kept.)
    // NB: from level 75+, the XP can legitimately EXCEED the level's threshold —
    // levelling up also requires finishing tasks (the "1/4" steps icon) — so the
    // XP-overflow check only applies below level 75.
    let sanityReason = null;
    if (lvl != null && lvl > 85) sanityReason = `niveau impossible (${lvl})`;
    else if (lvl != null && lvl < 75 && xpCur != null && xpMax != null && xpCur > xpMax)
      sanityReason = 'barre d’XP incohérente (XP du niveau supérieure au palier requis)';

    const llmSuspected = parsed.tampering_suspected === true;
    const llmReason = String(parsed.tampering_reason ?? '').trim();

    // Team: trust the deterministic colour analysis first; the model is fallback.
    const llmTeam = TEAMS.has(String(parsed.team ?? '').toLowerCase()) ? String(parsed.team).toLowerCase() : null;
    const team = (await colorTeamPromise) ?? llmTeam;

    return {
      trainerName,
      friendCode,
      // Read the level as shown (no 50 cap — the game goes higher); sanity-bound only.
      level: lvl && lvl >= 1 && lvl <= 100 ? lvl : null,
      levelXp: xpCur,
      levelXpMax: xpMax,
      xp: toInt(parsed.total_xp),
      pokedex: toInt(parsed.caught),
      distance: toKm(parsed.distance_km),
      pokestops: toInt(parsed.pokestops),
      eggs: toInt(parsed.eggs_hatched),
      team,
      authenticity: {
        // Default to genuine unless the model explicitly says otherwise.
        isPogo: parsed.is_pogo_screenshot !== false,
        // Flagged if the AI suspects editing OR a value is physically impossible.
        suspected: llmSuspected || sanityReason != null,
        // `certain` = proven fake (impossible value), as opposed to the AI's guess.
        certain: sanityReason != null,
        reason: sanityReason || llmReason,
      },
    };
  } catch (error) {
    console.error('[vision] Stats extraction failed:', error);
    return { ...EMPTY_STATS };
  }
}
