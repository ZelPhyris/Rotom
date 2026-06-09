import { config } from '../config.js';

/**
 * Funny welcome lines, picked at random when a newcomer is validated.
 * Use {user} where the member mention should appear.
 */
const LINES = [
  'Félicitations ! {user} a évolué en membre du serveur ! 🌟',
  '{user} a utilisé INSCRIPTION ! C’est super efficace ! Bienvenue ! ⚡',
  'Le Professeur Chen a un Pokédex pour toi, {user} ! Bienvenue ! 📕',
  'Un {user} sauvage apparaît !… et il décide de rester avec nous ! 🎣',
  '{user} a capturé le serveur avec une Master Ball ! Bienvenue ! 🟣',
  '{user} a choisi son starter et part à l’aventure ! Bienvenue ! 🔥💧🌿',
  'Bip… bip… le Pokématos sonne : {user} a rejoint l’équipe ! 📟',
  '{user} a obtenu le Badge Communauté ! Bienvenue à Pau ! 🥇',
  'La Team Rocket décolle vers d’autres cieux… mais {user} reste avec nous ! 🚀',
  'L’infirmière Joëlle te souhaite la bienvenue, {user} ! Tes Pokémon sont soignés. 💗',
  '{user} a traversé les hautes herbes et nous rejoint sain et sauf ! 🌿',
  'Rejoindre le serveur, c’était dans la poche… Pokéball, go ! Bienvenue {user} ! 🔴',
];

function randomLine(mention) {
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  return line.replaceAll('{user}', mention);
}

/**
 * Post a random welcome message for a freshly validated member.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 */
export async function sendWelcome(guild, member) {
  if (!config.welcomeChannelId) return;

  const channel = await guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel
    .send({
      content: randomLine(`<@${member.id}>`),
      allowedMentions: { users: [member.id] },
    })
    .catch(() => {});
}
