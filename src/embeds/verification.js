import { EmbedBuilder } from 'discord.js';
import { EXAMPLE_FILE, hasExampleImage } from './exampleImage.js';

const BRAND = 0xffffff; // white

/**
 * Verification channel embed — asks newcomers for a Pokémon GO profile
 * screenshot. Placeholder copy: edit freely.
 * @returns {EmbedBuilder}
 */
export function buildVerificationEmbed() {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('👋 Bienvenue ! Une dernière étape')
    .setDescription(
      [
        'Pour accéder au serveur, poste ici une **capture d’écran** de Pokémon GO :',
        '',
        '📸 **obligatoire** — ton **profil de dresseur** (avec ton pseudo).',
        '',
        '📸 *(facultatif)* — ton **code ami** (l’écran « Ajouter un ami » avec les 12 chiffres) : un petit plus pour que la commu t’ajoute plus vite.',
        '',
        'Un membre de l’équipe validera, et ton pseudo (et ton code ami s’il est fourni) seront enregistrés automatiquement. Tu auras alors accès à l’ensemble des salons.',
        '',
        '👇 **Exemple** d’une capture de profil bien lisible.',
        '',
        'Merci, et à très vite sur le terrain ! 🎮',
      ].join('\n'),
    );

  // Show the example screenshot at the bottom of the embed when it's available.
  if (hasExampleImage()) embed.setImage(`attachment://${EXAMPLE_FILE}`);
  return embed;
}
