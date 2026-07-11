import { requireAdmin } from '../auth.js';
import { config } from '../config.js';
import {
  getGuildConfig,
  updateGuildConfig,
  adminMembers,
  memberDataMap,
  adminUpdateMember,
  adminSetChatXp,
  adminOverview,
  getMessages,
  upsertMessage,
  MESSAGE_KEYS,
} from '../db.js';
import {
  hasBotToken,
  getBotUser,
  fetchGuildChannels,
  fetchGuildRoles,
  fetchGuildCounts,
  fetchGuildMembers,
  avatarUrlsFor,
} from '../discord.js';

/**
 * Admin dashboard API. Every route is gated by `requireAdmin` (signed session +
 * admin status). Member edits hit the bot's live tables so the site reflects
 * them at once; guild config persists for the bot to read after rewiring.
 */
// Map team role IDs (from the guild config) → team key.
function teamRoleMap(guild) {
  const m = new Map();
  if (guild?.team_role_mystic) m.set(guild.team_role_mystic, 'mystic');
  if (guild?.team_role_valor) m.set(guild.team_role_valor, 'valor');
  if (guild?.team_role_instinct) m.set(guild.team_role_instinct, 'instinct');
  return m;
}

// A member's team: declared in DB if present, else derived from their roles.
function teamOf(member, roleMap, dbTeam) {
  if (dbTeam) return dbTeam;
  for (const r of member.roles) if (roleMap.has(r)) return roleMap.get(r);
  return null;
}

export async function adminRoutes(app) {
  // --- Overview (dashboard home) ---
  app.get('/api/admin/overview', { preHandler: requireAdmin }, async () => {
    const [stats, counts, roster, guild, data] = await Promise.all([
      adminOverview(),
      fetchGuildCounts(config.guildId),
      fetchGuildMembers(config.guildId),
      getGuildConfig(config.guildId),
      memberDataMap(),
    ]);

    // Team distribution from roles (covers everyone), not just declared profiles.
    let teams = stats?.teams;
    if (roster) {
      const roleMap = teamRoleMap(guild);
      const t = { mystic: 0, valor: 0, instinct: 0 };
      for (const m of roster) {
        const team = teamOf(m, roleMap, data.get(m.discordId)?.team);
        if (team && t[team] != null) t[team] += 1;
      }
      teams = t;
    }
    return { stats: { ...stats, teams }, server: counts };
  });

  // --- Server config (`guilds`) ---
  app.get('/api/admin/guild', { preHandler: requireAdmin }, async () => {
    const guild = await getGuildConfig(config.guildId);
    return { guild, hasBotToken: hasBotToken() };
  });

  app.post('/api/admin/guild', { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    await updateGuildConfig(config.guildId, body);
    return { ok: true, guild: await getGuildConfig(config.guildId) };
  });

  // --- Customisable messages ---
  const messageKeys = new Set(MESSAGE_KEYS);

  app.get('/api/admin/messages', { preHandler: requireAdmin }, async () => {
    const [messages, bot] = await Promise.all([getMessages(config.guildId), getBotUser()]);
    return { messages, bot };
  });

  app.post('/api/admin/messages/:key', { preHandler: requireAdmin }, async (request, reply) => {
    const key = String(request.params.key || '');
    if (!messageKeys.has(key)) return reply.code(400).send({ error: 'unknown_message' });
    const body = request.body;
    if (!body || typeof body !== 'object') return reply.code(400).send({ error: 'invalid_body' });
    await upsertMessage(config.guildId, key, body);
    return { ok: true };
  });

  // --- Channels & roles for the selectors ---
  app.get('/api/admin/discord', { preHandler: requireAdmin }, async () => {
    const [channels, roles] = await Promise.all([
      fetchGuildChannels(config.guildId),
      fetchGuildRoles(config.guildId),
    ]);
    return { channels, roles, hasBotToken: hasBotToken() };
  });

  // --- Member moderation ---
  // Lists the LIVE server roster (humans), enriched with PoGo profile + chat XP.
  // Falls back to the DB-only list if the member intent is unavailable.
  app.get('/api/admin/members', { preHandler: requireAdmin }, async () => {
    const [roster, data, guild] = await Promise.all([
      fetchGuildMembers(config.guildId),
      memberDataMap(),
      getGuildConfig(config.guildId),
    ]);

    if (!roster) {
      // Fallback: only members that have a DB row.
      const members = await adminMembers();
      const avatars = await avatarUrlsFor(members.map((m) => m.discordId));
      return {
        source: 'db',
        members: members.map((m) => ({ ...m, username: m.ign, avatarUrl: avatars.get(m.discordId) ?? null })),
      };
    }

    const roleMap = teamRoleMap(guild);
    const members = roster.map((m) => {
      const d = data.get(m.discordId) || {};
      return {
        discordId: m.discordId,
        username: m.username,
        avatarUrl: m.avatar,
        // IGN: declared in DB, else the server nickname (members are renamed to it).
        ign: d.ign ?? m.nick ?? null,
        // Team: declared in DB, else from the member's team role.
        team: teamOf(m, roleMap, d.team),
        level: d.level ?? null,
        totalXp: d.totalXp ?? null,
        classement: d.classement ?? false,
        chatXp: d.chatXp ?? 0,
      };
    });
    // Classement members first, then by in-game XP, then chat XP, then name.
    members.sort(
      (a, b) =>
        Number(b.classement) - Number(a.classement) ||
        (b.totalXp ?? -1) - (a.totalXp ?? -1) ||
        (b.chatXp ?? 0) - (a.chatXp ?? 0) ||
        a.username.localeCompare(b.username),
    );
    return { source: 'guild', members };
  });

  app.post('/api/admin/members/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = String(request.params.id || '');
    const b = request.body ?? {};
    const patch = {};
    if (typeof b.ign === 'string') patch.ign = b.ign;
    if (typeof b.classement === 'boolean') patch.classement = b.classement;
    if (!id || Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'nothing_to_update' });
    }
    const ok = await adminUpdateMember(id, patch);
    if (!ok) return reply.code(404).send({ error: 'member_not_found' });
    return { ok: true };
  });

  app.post('/api/admin/members/:id/xp', { preHandler: requireAdmin }, async (request, reply) => {
    const id = String(request.params.id || '');
    const b = request.body ?? {};
    const amount = Number(b.amount);
    const mode = b.mode === 'add' ? 'add' : 'set';
    if (!id || !Number.isFinite(amount)) {
      return reply.code(400).send({ error: 'invalid_amount' });
    }
    await adminSetChatXp(id, amount, mode);
    return { ok: true };
  });
}
