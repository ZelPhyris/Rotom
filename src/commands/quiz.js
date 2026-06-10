import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * "Qui est ce Pokémon ?" — picks a random Pokémon from the free PokéAPI, posts
 * a black silhouette of its official artwork, and the first member to type the
 * (French) name wins. Reveals the answer after a correct guess or a timeout.
 */
const MAX_ID = 1025; // PokéAPI national dex coverage
const TIMEOUT_MS = 30_000;
const active = new Set(); // channelIds with a running quiz (one at a time)

export const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('Qui est ce Pokémon ? Devine d’après la silhouette !');

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchPokemon() {
  const id = 1 + Math.floor(Math.random() * MAX_ID);
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) throw new Error(`species ${id}: ${res.status}`);
  const data = await res.json();
  const fr = data.names.find((n) => n.language.name === 'fr')?.name;
  const en = data.names.find((n) => n.language.name === 'en')?.name;
  const artwork = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  return { id, fr: fr ?? en, en, artwork };
}

async function silhouetteBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`artwork: ${res.status}`);
  const img = await loadImage(Buffer.from(await res.arrayBuffer()));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 20) {
      px[i] = 28;
      px[i + 1] = 28;
      px[i + 2] = 40;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}

export async function execute(interaction) {
  if (active.has(interaction.channelId)) {
    await interaction.reply({ content: 'Un quiz est déjà en cours dans ce salon ! 🕹️', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  let mon;
  let buffer;
  try {
    mon = await fetchPokemon();
    buffer = await silhouetteBuffer(mon.artwork);
  } catch (error) {
    console.error('[quiz] failed to prepare:', error?.message ?? error);
    await interaction.editReply('Impossible de préparer le quiz pour le moment, réessaie. 😕');
    return;
  }

  active.add(interaction.channelId);

  const file = new AttachmentBuilder(buffer, { name: 'mystere.png' });
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Qui est ce Pokémon ? 🔍')
    .setDescription('Tape le nom du Pokémon dans le chat !')
    .setImage('attachment://mystere.png')
    .setFooter({ text: '30 secondes…' });

  await interaction.editReply({ embeds: [embed], files: [file] });

  const answers = new Set([normalize(mon.fr), mon.en && normalize(mon.en)].filter(Boolean));
  const collector = interaction.channel.createMessageCollector({
    filter: (m) => !m.author.bot && answers.has(normalize(m.content)),
    max: 1,
    time: TIMEOUT_MS,
  });

  collector.on('end', async (collected) => {
    active.delete(interaction.channelId);
    const winner = collected.first();
    const reveal = new EmbedBuilder()
      .setColor(winner ? 0x57f287 : 0xed4245)
      .setTitle(`C’était ${mon.fr} !`)
      .setImage(mon.artwork)
      .setDescription(
        winner
          ? `✅ Bravo ${winner.author}, bien joué !`
          : '⏱️ Temps écoulé ! Personne n’a trouvé cette fois.',
      );
    await interaction.channel.send({ embeds: [reveal] }).catch(() => {});
  });
}
