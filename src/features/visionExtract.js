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
  'Regarde cette capture d’écran du profil Pokémon GO. Extrais, uniquement s’ils sont visibles :',
  '- le niveau du dresseur (un entier de 1 à 50, souvent près de l’avatar),',
  '- l’XP totale (les points d’expérience cumulés, parfois écrits "12 345 678"),',
  '- le nombre de Pokémon capturés (statistique "Pokémon capturés").',
  'Réponds STRICTEMENT en JSON : {"level": number, "total_xp": number, "caught": number}.',
  'Mets 0 pour toute valeur absente de l’image.',
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

/**
 * Extract Pokémon GO stats (level, total XP, caught count) from a screenshot.
 * Absent or implausible values come back null.
 * @param {string} imageUrl
 * @returns {Promise<{ level: number|null, xp: number|null, pokedex: number|null }>}
 */
export async function extractStats(imageUrl) {
  if (!ai) return { level: null, xp: null, pokedex: null };

  try {
    const { data, mimeType } = await fetchImage(imageUrl);
    const response = await generateWithRetry({
      model: config.visionModel,
      contents: [{ inlineData: { mimeType, data } }, { text: STATS_PROMPT }],
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text;
    if (!text) return { level: null, xp: null, pokedex: null };

    const parsed = JSON.parse(text);
    const toInt = (v) => {
      const n = Math.round(Number(String(v ?? '').replace(/\s/g, '')));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const lvl = toInt(parsed.level);
    return {
      level: lvl && lvl >= 1 && lvl <= 50 ? lvl : null,
      xp: toInt(parsed.total_xp),
      pokedex: toInt(parsed.caught),
    };
  } catch (error) {
    console.error('[vision] Stats extraction failed:', error);
    return { level: null, xp: null, pokedex: null };
  }
}
