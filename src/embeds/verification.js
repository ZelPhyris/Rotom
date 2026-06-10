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
        'Pour accéder au serveur, poste ici **deux captures d’écran** de Pokémon GO :',
        '',
        '📸 **1.** ton **profil de dresseur** (avec ton pseudo),',
        '📸 **2.** ton **code ami** (l’écran « Ajouter un ami » avec les 12 chiffres).',
        '',
        'Un membre de l’équipe validera, et ton pseudo et ton code ami seront enregistrés automatiquement. Tu auras alors accès à l’ensemble des salons.',
        '',
        'Merci, et à très vite sur le terrain ! 🎮',
      ].join('\n'),
    );
}
