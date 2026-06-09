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
  'Cette image est-elle une capture du profil d’un joueur Pokémon GO ?',
  'Si oui, extrais uniquement le nom de dresseur (le pseudo affiché en haut du profil).',
  'Réponds STRICTEMENT en JSON : {"found": boolean, "trainer_name": string}.',
  'Si ce n’est pas un profil Pokémon GO, renvoie {"found": false, "trainer_name": ""}.',
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

/**
 * @param {string} imageUrl  publicly fetchable image URL (e.g. a Discord attachment)
 * @returns {Promise<string|null>}  the trainer name, or null if none/error
 */
export async function extractTrainerName(imageUrl) {
  if (!ai) return null;

  try {
    const res = await fetch(imageUrl);
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png';

    const response = await generateWithRetry({
      model: config.visionModel,
      contents: [{ inlineData: { mimeType, data } }, { text: PROMPT }],
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const name = parsed.found ? String(parsed.trainer_name ?? '').trim() : '';
    return name || null;
  } catch (error) {
    console.error('[vision] Trainer-name extraction failed:', error);
    return null;
  }
}
