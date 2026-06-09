import { EmbedBuilder } from 'discord.js';

const BRAND = 0xffffff; // white

/**
 * Verification channel embed — asks newcomers for a Pokémon GO profile
 * screenshot. Placeholder copy: edit freely.
 * @returns {EmbedBuilder}
 */
export function buildVerificationEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle('👋 Bienvenue ! Une dernière étape')
    .setDescription(
      [
        'Pour accéder au serveur, poste ici une **capture d’écran de ton profil Pokémon GO** (l’écran de profil de dresseur).',
        '',
        'Un membre de l’équipe la validera, et tu auras alors accès à l’ensemble des salons.',
        '',
        'Merci, et à très vite sur le terrain ! 🎮',
      ].join('\n'),
    );
}
