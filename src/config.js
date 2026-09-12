require('dotenv').config();

const ids = name => (process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean);

// أضفنا 'remove-points' هنا لكي يقرأ COMMAND_REMOVE_POINTS_ROLE_IDS تلقائياً
const commandNames = [
  'ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'unwarn', 'warnings', 
  'serverinfo', 'addrole', 'removerole', 'lock', 'unlock', 'temprole', 'leaderboard', 
  'nickname', 'giveaway', 'apply', 'apply-open', 'apply-close', 'points', 'remove-points', 'joinvoice'
];

const gameNames = ['ctweet', 'fastest', 'flags', 'words', 'rps', 'shooting'];
const roleMap = (names, prefix) => Object.fromEntries(names.map(name => [name, ids(`${prefix}_${name.replace(/-/g, '_').toUpperCase()}_ROLE_IDS`)]));

module.exports = {
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  voiceChannelId: process.env.VOICE_CHANNEL_ID,
  adminUserIds: ids('ADMIN_USER_IDS'),
  adminRoleIds: ids('ADMIN_ROLE_IDS'),
  commandRoleIds: roleMap(commandNames, 'COMMAND'),
  gameRoleIds: roleMap(gameNames, 'GAME'),
  allGameRoleIds: ids('GAME_ROLE_IDS'),
  applicationChannelId: process.env.APPLICATION_CHANNEL_ID?.trim() || '1542864447989747722',
  applicationReviewChannelId: process.env.APPLICATION_REVIEW_CHANNEL_ID?.trim() || '1542864761488801843',
  applicationReviewRoleIds: ids('APPLICATION_REVIEW_ROLE_IDS'),
  levelUpChannelId: process.env.LEVEL_UP_CHANNEL_ID?.trim() || '1542846219074797598',
  outputChannelId: process.env.BOT_OUTPUT_CHANNEL_ID?.trim() || '1542864761488801843',
  modLogChannelId: process.env.MOD_LOG_CHANNEL_ID,
  logChannels: {
    messages: process.env.MESSAGE_LOG_CHANNEL_ID,
    voice: process.env.VOICE_LOG_CHANNEL_ID,
    members: process.env.MEMBER_LOG_CHANNEL_ID,
    moderation: process.env.MODERATION_LOG_CHANNEL_ID,
    channels: process.env.CHANNEL_LOG_CHANNEL_ID,
    other: process.env.OTHER_LOG_CHANNEL_ID
  }
};