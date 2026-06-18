import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

/**
 * Reads a Pokémon GO profile screenshot with Google Gemini (free tier) and
 * extracts the trainer name. Dormant if GEMINI_API_KEY is not configured.
 */
const ai = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;

export function hasVision() {
  return ai !== null;
}

const PROMPT = [
  'Regarde cette capture d’écran Pokémon GO. Extrais, uniquement s’ils sont visibles :',
  '- le nom de dresseur (le pseudo affiché),',
  '- le code ami (un nombre à 12 chiffres, parfois écrit "1234 5678 9012").',
  'Réponds STRICTEMENT en JSON : {"trainer_name": string, "friend_code": string}.',
  'Mets une chaîne vide pour toute valeur absente de l’image.',
].join('\n');

// Gemini's free tier occasionally returns 503/429 under load — retry transient errors.
async function generateWithRetry(params, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      const status = error?.status;
      const transient = status === 503 || status === 429 || status === 500;
      if (!transient || i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

const STATS_PROMPT = [
  'Tu lis une capture d’écran Pokémon GO (écran de profil ou liste de statistiques).',
  'Extrais chaque valeur UNIQUEMENT si elle est clairement visible sur l’image :',
  '- "level" : le grand nombre sous le mot "NIVEAU", près de l’avatar (un entier, ex. 38, 50, 51…). Lis-le tel quel, ne le plafonne pas.',
  '- "level_xp_current" : à côté du niveau, le nombre AVANT le "/" dans la barre d’XP (XP dans le niveau actuel, ex. "654 012 / 1 580 000" → 654012).',
  '- "level_xp_needed" : dans cette même barre, le nombre APRÈS le "/" (XP requis pour ce niveau, ex. "654 012 / 1 580 000" → 1580000).',
  '- "total_xp" : le "Total de PX" / "Total XP" cumulé, dans la liste de statistiques (un grand nombre, ex. "14 847 012").',
  '- "caught" : "Pokémon capturés" / "Pokémon attrapés" (un entier).',
  '- "distance_km" : "Distance parcourue" / "Distance marchée" en kilomètres (un nombre décimal, ex. "376,3 km" → 376.3).',
  '- "pokestops" : "PokéStops visités" (un entier).',
  '- "team" : la COULEUR du numéro de niveau et de la barre de progression indique l’équipe. BLEU → "mystic", ROUGE → "valor", JAUNE/OR → "instinct". Si la couleur est indéterminée ou absente, mets "".',
  'Ignore les séparateurs de milliers (espaces, points, virgules). La virgule décimale du km devient un point.',
  '',
  'AUTHENTICITÉ — analyse aussi si l’image semble truquée :',
  '- "is_pogo_screenshot" : true si c’est une vraie capture de l’application Pokémon GO (interface du jeu). false si c’est un montage, une photo d’un autre écran/jeu, ou une image quelconque.',
  '- "tampering_suspected" : true si tu repères des signes de RETOUCHE/MONTAGE sur les nombres : police, taille, graisse ou alignement d’un chiffre incohérents avec le reste de l’interface ; halo, flou ou artefacts de compression localisés autour d’un nombre ; pixels recopiés ; chiffre mal centré dans sa zone ; bordure nette d’un rectangle collé. Sinon false. Dans le doute (image nette et cohérente), mets false.',
  '- "tampering_reason" : si tampering_suspected vaut true, une courte explication en français (ex. "le Total XP a une police différente du reste"). Sinon "".',
  '',
  'Réponds STRICTEMENT en JSON : {"level": number, "level_xp_current": number, "level_xp_needed": number, "total_xp": number, "caught": number, "distance_km": number, "pokestops": number, "team": string, "is_pogo_screenshot": boolean, "tampering_suspected": boolean, "tampering_reason": string}.',
  'Mets 0 (ou 0.0 pour la distance, "" pour team) pour toute valeur que tu ne vois pas. N’invente jamais une valeur.',
].join('\n');

/** Fetch an image URL and return { data: base64, mimeType }. */
async function fetchImage(imageUrl) {
  const res = await fetch(imageUrl);
  const data = Buffer.from(await res.arrayBuffer()).toString('base64');
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png';
  return { data, mimeType };
}

/**
 * Extract the trainer name and/or 12-digit friend code from a screenshot.
 * @param {string} imageUrl  publicly fetchable image URL (e.g. a Discord attachment)
 * @returns {Promise<{ trainerName: string|null, friendCode: string|null }>}
 */
export async function extractProfile(imageUrl) {
  if (!ai) return { trainerName: null, friendCode: null };

  try {
    const { data, mimeType } = await fetchImage(imageUrl);
    const response = await generateWithRetry({
      model: config.visionModel,
      contents: [{ inlineData: { mimeType, data } }, { text: PROMPT }],
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text;
    if (!text) return { trainerName: null, friendCode: null };

    const parsed = JSON.parse(text);
    const trainerName = String(parsed.trainer_name ?? '').trim() || null;
    const digits = String(parsed.friend_code ?? '').replace(/\D/g, '');
    const friendCode = digits.length === 12 ? digits : null;
    return { trainerName, friendCode };
  } catch (error) {
    console.error('[vision] Profile extraction failed:', error);
    return { trainerName: null, friendCode: null };
  }
}

// Default authenticity verdict: trust the image (no rejection) when vision is
// off or errors out — so an API hiccup never wrongly flags an honest member.
const TRUSTED = { isPogo: true, suspected: false, reason: '' };

const EMPTY_STATS = {
  level: null,
  levelXp: null,
  levelXpMax: null,
  xp: null,
  pokedex: null,
  distance: null,
  pokestops: null,
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
    const { data, mimeType } = await fetchImage(imageUrl);
    const response = await generateWithRetry({
      model: config.visionModel,
      contents: [{ inlineData: { mimeType, data } }, { text: STATS_PROMPT }],
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text;
    if (!text) return { ...EMPTY_STATS };

    const parsed = JSON.parse(text);
    const lvl = toInt(parsed.level);
    return {
      // Read the level as shown (no 50 cap — the game goes higher); sanity-bound only.
      level: lvl && lvl >= 1 && lvl <= 100 ? lvl : null,
      levelXp: toInt(parsed.level_xp_current),
      levelXpMax: toInt(parsed.level_xp_needed),
      xp: toInt(parsed.total_xp),
      pokedex: toInt(parsed.caught),
      distance: toKm(parsed.distance_km),
      pokestops: toInt(parsed.pokestops),
      team: TEAMS.has(String(parsed.team ?? '').toLowerCase()) ? String(parsed.team).toLowerCase() : null,
      authenticity: {
        // Default to genuine unless the model explicitly says otherwise.
        isPogo: parsed.is_pogo_screenshot !== false,
        suspected: parsed.tampering_suspected === true,
        reason: String(parsed.tampering_reason ?? '').trim(),
      },
    };
  } catch (error) {
    console.error('[vision] Stats extraction failed:', error);
    return { ...EMPTY_STATS };
  }
}
