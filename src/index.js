require('dotenv').config();

// ------------------- [ سيرفر الـ Keep-Alive لـ UptimeRobot ] -------------------
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is active and running!'));
app.listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));
// --------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { joinVoiceChannel } = require('@discordjs/voice');
const {
  Client, Events, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  REST, Routes, SlashCommandBuilder
} = require('discord.js');
const config = require('./config');

// إعدادات رومات إعادة التوجيه والتقديم
const FORWARD_SOURCE_CHANNEL_ID = '1542864447989747722';
const FORWARD_TARGET_CHANNEL_ID = '1542864761488801843';
const APPLY_LOG_CHANNEL_ID = 'ضع_هنا_ID_روم_استقبال_التقديمات';

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = name => path.join(dataDir, `${name}.json`);

function load(name, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch { return fallback; }
}
function save(name, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile(name), JSON.stringify(value, null, 2));
}

// ------------------- [ نظام إدارة النقاط ] -------------------
function getPoints(userId) {
  const points = load('points');
  return points[userId] || 0;
}
function changePoints(userId, amount) {
  const points = load('points');
  points[userId] = Math.max(0, (points[userId] || 0) + amount); // يمنع النقاط أنها تصير بالسالب
  save('points', points);
  return points[userId];
}
function pointsEmbed(target, amount, balance) {
  const action = amount >= 0 ? 'تم إضافة' : 'تم خصم';
  return new EmbedBuilder()
    .setColor(amount >= 0 ? 0x2ECC71 : 0xE74C3C)
    .setTitle(amount >= 0 ? 'إضافة نقاط' : 'خصم نقاط')
    .setDescription(`${action} **${Math.abs(amount)}** نقاط للعضو ${target}.\nرصيد ${target} الحالي: **${balance}**`)
    .setFooter({ text: '- Shadow System' });
}

function durationMs(value) {
  const match = /^([1-9]\d*)([mhd])$/i.exec(value?.trim() || '');
  if (!match) return null;
  const ms = Number(match[1]) * ({ m: 60000, h: 3600000, d: 86400000 })[match[2].toLowerCase()];
  return ms <= 28 * 86400000 ? ms : null;
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || config.adminUserIds?.includes(interaction.user.id)
    || interaction.member?.roles?.cache?.some(role => config.adminRoleIds?.includes(role.id));
}

function hasRoleAccess(interaction, commandName) {
  if (isAdmin(interaction)) return true;
  const isGame = commandName.startsWith('game-');
  const name = isGame ? commandName.replace('game-', '') : commandName;
  const configuredRoles = isGame ? config.gameRoleIds?.[name] : config.commandRoleIds?.[name];
  const allowedRoles = configuredRoles?.length ? configuredRoles : isGame ? config.allGameRoleIds : [];
  return !allowedRoles?.length || interaction.member?.roles?.cache?.some(role => allowedRoles.includes(role.id));
}

function canManagePoints(interaction, commandName) {
  if (isAdmin(interaction)) return true;
  return hasRoleAccess(interaction, commandName);
}

function canModerate(interaction, member, permission) {
  if (!isAdmin(interaction) && !interaction.memberPermissions?.has(permission)) return 'لا تملك الصلاحية المطلوبة.';
  if (member.id === interaction.user.id || member.id === interaction.client.user.id) return 'لا يمكنك تنفيذ الأمر على هذا العضو.';
  if (!isAdmin(interaction) && member.roles.highest.position >= interaction.member.roles.highest.position) return 'لا يمكنك معاقبة رتبة مساوية أو أعلى منك.';
  return null;
}

function code() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }

function gameEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

async function sendLog(guild, type, title, fields, color = 0x5865F2) {
  const channelId = config.logChannels?.[type];
  if (!channelId || channelId.startsWith('معرف_')) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  const validFields = fields.filter(field => field.value !== undefined && field.value !== null && `${field.value}`.length > 0).map(field => ({ ...field, value: `${field.value}`.slice(0, 1024) }));
  if (validFields.length) embed.addFields(validFields);
  await channel.send({ embeds: [embed] }).catch(() => {});
}

function moderationFields(action, target, moderator, reason, duration) {
  return [
    { name: 'العضو', value: `${target} (${target.user?.tag || target.tag || target.id})`, inline: true },
    { name: 'المسؤول', value: `${moderator} (${moderator.tag || moderator.id})`, inline: true },
    { name: 'الإجراء', value: action, inline: true },
    { name: 'السبب', value: reason || 'لم يتم تحديد سبب', inline: false },
    { name: 'المدة', value: duration || 'دائم / غير محددة', inline: true }
  ];
}

const activeGames = new Map();
const rpsChallenges = new Map();

const wordSentences = [
  ['اكل', 'احمد', 'التفاح'], ['شرب', 'محمد', 'الماء'], ['كتب', 'الطالب', 'الواجب'],
  ['لعب', 'الطفل', 'بالكرة'], ['زار', 'خالد', 'المتحف'], ['قرأت', 'سارة', 'الكتاب'],
  ['زرع', 'الفلاح', 'الشجرة'], ['شاهد', 'علي', 'الفيلم'], ['طبخت', 'الأم', 'الغداء'],
  ['ركب', 'المسافر', 'الطائرة']
];
const flags = [
  ['🇸🇦', 'السعودية'], ['🇦🇪', 'الإمارات'], ['🇪🇬', 'مصر'], ['🇯🇴', 'الأردن'], ['🇰🇼', 'الكويت'], ['🇶🇦', 'قطر'],
  ['🇧🇭', 'البحرين'], ['🇴🇲', 'عمان'], ['🇲🇦', 'المغرب'], ['🇩🇿', 'الجزائر'], ['🇹🇳', 'تونس'], ['🇱🇧', 'لبنان'],
  ['🇺🇸', 'أمريكا'], ['🇬🇧', 'بريطانيا'], ['🇫🇷', 'فرنسا'], ['🇩🇪', 'ألمانيا'], ['🇮🇹', 'إيطاليا'], ['🇪🇸', 'إسبانيا'],
  ['🇹🇷', 'تركيا'], ['🇯🇵', 'اليابان'], ['🇨🇳', 'الصين'], ['🇰🇷', 'كوريا'], ['🇮🇳', 'الهند'], ['🇧🇷', 'البرازيل']
];
const questions = ['ما أكثر موقف محرج مررت به؟', 'من أكثر شخص تثق به؟', 'ما الشيء الذي لا يعرفه الناس عنك؟', 'ما حلمك الأكبر؟', 'ما آخر كذبة قلتها؟'];

function shootingButtons(gameId, started = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shoot:join:${gameId}`).setLabel('انضمام').setStyle(ButtonStyle.Success).setDisabled(started),
    new ButtonBuilder().setCustomId(`shoot:leave:${gameId}`).setLabel('خروج').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shoot:start:${gameId}`).setLabel('بدء الجولة').setStyle(ButtonStyle.Primary).setDisabled(started)
  )];
}

function shuffledSentence() {
  const answer = wordSentences[Math.floor(Math.random() * wordSentences.length)];
  return { answer: answer.join(' '), scrambled: [...answer].sort(() => Math.random() - 0.5).join('   ') };
}

function normalizeAnswer(value) {
  return value.trim().replace(/[ًٌٍَُِّْـ]/g, '').replace(/\s+/g, ' ');
}

async function handleGameAnswer(message) {
  const session = [...activeGames.values()].reverse().find(game => game.channelId === message.channelId && game.answer);
  if (!session || normalizeAnswer(message.content) !== normalizeAnswer(session.answer)) return false;
  await message.reply({ embeds: [gameEmbed('إجابة صحيحة!', `أحسنت ${message.author}! إجابتك صحيحة.`, 0x2ECC71)] });
  activeGames.delete(session.id);
  return true;
}

async function findMember(guild, token, message) {
  const mentioned = message?.mentions?.members?.first();
  if (mentioned) return mentioned;
  const id = token?.match(/^<?@!?([0-9]+)>?$/)?.[1] || token;
  return /^\d+$/.test(id) ? guild.members.fetch(id).catch(() => null) : null;
}

function textCommand(content) {
  const normalized = content.trim().replace(/[ًٌٍَُِّْـ]/g, '');
  const aliases = {
    'باند': 'ban', 'فك باند': 'unban', 'ارجع': 'unban', 'طرد': 'kick', 'تايم اوت': 'timeout', 'تايم': 'timeout', 'اسكات': 'timeout',
    'فك تايم اوت': 'untimeout', 'تكلم': 'untimeout', 'تحدث': 'untimeout', 'تحذير': 'warn', 'ازالة تحذير': 'unwarn',
    'تحذيرات': 'warnings', 'سيرفر': 'serverinfo',
    'فتح': 'unlock', 'قفل': 'lock', 'قيفاواي': 'giveaway',
    'دخول صوتي': 'joinvoice', 'فتح تقديم': 'apply-open', 'اغلاق تقديم': 'apply-close', 'تقديم': 'apply',
    
    // أوامر النقاط
    'نقاط': 'points', 'نقطة': 'points', 'اضافة نقاط': 'add-points', 'إضافة نقاط': 'add-points',
    'خصم نقاط': 'remove-points',

    'كت': 'game-ctweet', 'كت تويت': 'game-ctweet', 'اسرع': 'game-fastest', 'أسرع': 'game-fastest',
    'دول': 'game-flags', 'اعلام': 'game-flags', 'جمع': 'game-words',
    'طوبة': 'game-rps', 'حجرة ورقة مقص': 'game-rps', 'اطلاق النار': 'game-shooting'
  };
  const key = Object.keys(aliases).sort((a, b) => b.length - a.length).find(value => normalized === value || normalized.startsWith(`${value} `));
  return key ? { name: aliases[key], args: normalized.slice(key.length).trim() } : null;
}

const slashCommandsData = [
  new SlashCommandBuilder().setName('ping').setDescription('فحص استجابة البوت'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('عرض معلومات السيرفر'),
  new SlashCommandBuilder().setName('points').setDescription('عرض نقاطك أو نقاط عضو')
    .addUserOption(opt => opt.setName('user').setDescription('العضو المراد فحص نقاطه')),
  new SlashCommandBuilder().setName('apply').setDescription('إرسال زر التقديم الإداري'),
  new SlashCommandBuilder().setName('apply-open').setDescription('فتح التقديم الإداري'),
  new SlashCommandBuilder().setName('apply-close').setDescription('إغلاق التقديم الإداري')
];

async function handleTextCommand(message) {
  const parsed = textCommand(message.content);
  if (!parsed) return false;
  const { name, args } = parsed;

  const fakeInteraction = { memberPermissions: message.member.permissions, user: message.author, member: message.member };

  if (!hasRoleAccess(fakeInteraction, name)) {
    await message.reply('لا تملك الرتبة المسموح لها باستخدام هذا الأمر.');
    return true;
  }

  const parts = args.split(/\s+/).filter(Boolean);
  const reply = text => message.reply(text);

  if (name === 'apply-open' || name === 'apply-close') { 
    if (!isAdmin(fakeInteraction)) { await reply('لا تملك صلاحية إدارة التقديم.'); return true; } 
    const state = load('application'); 
    state.open = name === 'apply-open'; 
    save('application', state); 
    await reply(`تم ${state.open ? 'فتح' : 'إغلاق'} تقديم الإدارة.`); 
    return true; 
  }

  if (name === 'apply') {
    const state = load('application');
    if (!state.open) { await reply('❌ التقديم مغلق حالياً، انتظر حتى يتم فتحه.'); return true; }
    const applyEmbed = new EmbedBuilder().setTitle('📝 تقديم على الإدارة').setDescription('اضغط على الزر أسفله للبدء في تعبئة نموذج التقديم المتكون من 5 أسئلة.').setColor(0x3498DB);
    const applyRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_apply_modal').setLabel('بدء التقديم 📝').setStyle(ButtonStyle.Primary));
    await message.channel.send({ embeds: [applyEmbed], components: [applyRow] });
    return true;
  }

  // ------------------- [ معالجة أوامر النقاط ] -------------------
  if (name === 'points' || name === 'add-points' || name === 'remove-points') {
    const targetToken = parts[0];
    const target = targetToken ? await findMember(message.guild, targetToken, message) : null;

    if (name === 'points' && (!parts[1] || isNaN(parts[1]))) {
      const userToFetch = target ? target.user : (targetToken ? null : message.author);
      if (!userToFetch && targetToken) { await reply('حدد العضو بشكل صحيح عن طريق المنشن أو الـ ID.'); return true; }
      
      const balance = getPoints(userToFetch.id);
      await reply({ embeds: [new EmbedBuilder().setTitle(`نقاط ${userToFetch.username}`).setDescription(`الرصيد الحالي: **${balance}** نقطة.`).setColor(0x5865F2)] });
      return true;
    }

    if (!canManagePoints(fakeInteraction, name)) {
      await reply('لا تملك الصلاحية للتعديل على النقاط.');
      return true;
    }

    if (!target) { await reply('الرجاء تحديد العضو (مثال: نقاط @عضو 10)'); return true; }

    const amountToken = parts[1] || parts[0]; 
    const parsedAmount = Number(amountToken);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) { 
      await reply('الرجاء كتابة عدد نقاط صحيح، مثال: `نقاط @عضو 10` أو `خصم نقاط @عضو 10`'); 
      return true; 
    }

    const amount = name === 'remove-points' ? -parsedAmount : parsedAmount;
    const balance = changePoints(target.id, amount);
    await reply({ embeds: [pointsEmbed(target, amount, balance)] });
    return true;
  }

  if (name === 'giveaway') {
    const durationIndex = parts.findIndex(value => durationMs(value));
    const duration = durationIndex >= 0 ? parts[durationIndex] : null;
    const winnerToken = durationIndex >= 0 && /^\d+$/.test(parts[durationIndex + 1]) ? parts[durationIndex + 1] : null;
    const winners = winnerToken ? Number(winnerToken) : 1;
    const prizeParts = durationIndex >= 0 ? [...parts.slice(0, durationIndex), ...parts.slice(durationIndex + (winnerToken ? 2 : 1))] : [];
    if (!duration || !prizeParts.length) { await reply('طريقة الاستخدام: قيفاواي 10m 1 الجائزة'); return true; }
    const prize = prizeParts.join(' '); const giveawayId = code(); const giveaways = load('giveaways');
    giveaways[giveawayId] = { prize, winners, users: [], channelId: message.channelId }; save('giveaways', giveaways);
    const giveawayMessage = await message.reply({ embeds: [gameEmbed(`🎉 قيفاواي: ${prize}`, `اضغط الزر للدخول.\nينتهي خلال **${duration}**.\nعدد الفائزين: **${winners}**`, 0xF1C40F)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway:${giveawayId}`).setLabel('دخول القيفاواي').setStyle(ButtonStyle.Success))] });
    setTimeout(async () => { const current = load('giveaways')[giveawayId]; if (!current) return; const selected = [...current.users].sort(() => Math.random() - 0.5).slice(0, current.winners); await giveawayMessage.edit({ embeds: [gameEmbed(`انتهى القيفاواي: ${current.prize}`, `الفائزون: ${selected.length ? selected.map(id => `<@${id}>`).join('، ') : 'لا يوجد مشاركون'}`, 0x2ECC71)], components: [] }).catch(() => {}); const all = load('giveaways'); delete all[giveawayId]; save('giveaways', all); }, durationMs(duration));
    return true;
  }

  const gameCommands = ['game-ctweet', 'game-fastest', 'game-flags', 'game-words', 'game-rps', 'game-shooting'];
  const targetToken = parts.shift();

  if (gameCommands.includes(name)) {
    const gameId = `${message.guildId}-${message.id}`;

    if (name === 'game-rps') {
      const opponent = targetToken ? await findMember(message.guild, targetToken, message) : null;
      if (!opponent || opponent.id === message.author.id) { await reply('حدد خصمك بالمنشن أو الـ ID.'); return true; }
      
      const challengeId = code();
      const challengeEmbed = new EmbedBuilder()
        .setTitle('🎮 تحدي حجرة ورقة مقص (طوبة)')
        .setColor(0x5865F2)
        .setDescription(`قام ${message.author} بتحدي <@${opponent.id}>!\n\n**هل تقبل التحدي؟**`)
        .setFooter({ text: 'فقط العضو المذكور يمكنه القبول' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_accept_${challengeId}`).setLabel('قبول التحدي').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rps_decline_${challengeId}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [challengeEmbed], components: [row] });
      
      rpsChallenges.set(challengeId, {
        challengerId: message.author.id,
        opponentId: opponent.id,
        choices: {}
      });
      return true;
    }

    if (name === 'game-shooting') { 
      const session = { id: gameId, name, channelId: message.channelId, players: new Map([[message.author.id, message.author]]) }; 
      activeGames.set(gameId, session); 
      await message.channel.send({ embeds: [gameEmbed('إطلاق النار', 'انضموا للعبة ثم اضغطوا بدء الجولة.')], components: shootingButtons(gameId) }); 
      return true; 
    }

    const descriptions = { 'game-ctweet': questions[Math.floor(Math.random() * questions.length)], 'game-fastest': 'أول شخص يضغط الزر يفوز!', 'game-flags': 'أرسل اسم الدولة المطابق للعلم.', 'game-words': 'بدأت لعبة جمع الكلمات!' };
    const session = { id: gameId, name, channelId: message.channelId, players: new Map([[message.author.id, message.author]]) };
    
    if (name === 'game-words') { const wordGame = shuffledSentence(); session.answer = wordGame.answer; descriptions[name] = `رتب الجملة:\n**${wordGame.scrambled}**`; }
    if (name === 'game-flags') { const flag = flags[Math.floor(Math.random() * flags.length)]; session.answer = flag[1]; descriptions[name] = flag[0]; }
    
    activeGames.set(gameId, session);
    const components = [];
    if (name === 'game-fastest') components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fastest:${Date.now()}`).setLabel('اضغط الآن').setStyle(ButtonStyle.Danger)));
    
    const payload = { embeds: [gameEmbed(name === 'game-ctweet' ? 'كت تويت' : `لعبة ${name.replace('game-', '')}`, descriptions[name])], ...(components.length ? { components } : {}) };
    await message.channel.send(payload);
    return true;
  }

  const target = targetToken ? await findMember(message.guild, targetToken, message) : null;
  if (name === 'serverinfo') { await reply(`**${message.guild.name}**\nالأعضاء: ${message.guild.memberCount}\nالقنوات: ${message.guild.channels.cache.size}`); return true; }
  if (name === 'joinvoice') { if (!isAdmin(fakeInteraction)) { await reply('لا تملك صلاحية إدخال البوت للصوت.'); return true; } const channel = config.voiceChannelId && message.guild.channels.cache.get(config.voiceChannelId); if (!channel?.isVoiceBased()) { await reply('حدد VOICE_CHANNEL_ID صحيحًا في ملف .env.'); return true; } joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator }); await reply('دخلت الروم الصوتي.'); return true; }
  
  if (name === 'lock' || name === 'unlock') { 
    if (!isAdmin(fakeInteraction)) { await reply('لا تملك صلاحية إدارة الرومات.'); return true; } 
    const channel = message.mentions.channels.first() || message.channel; 
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: name === 'unlock' ? null : false }); 
    await reply(`تم ${name === 'lock' ? 'إغلاق' : 'فتح'} الروم.`); 
    return true; 
  }

  if (!target) { await reply('حدد العضو بالمنشن أو الـ ID.'); return true; }

  if (name === 'ban' || name === 'kick' || name === 'timeout' || name === 'untimeout' || name === 'warn') {
    const permission = name === 'ban' ? PermissionFlagsBits.BanMembers : name === 'kick' ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.ModerateMembers;
    const error = canModerate({ ...fakeInteraction, client }, target, permission); if (error) { await reply(error); return true; }
    if (name === 'warn') { const warnings = load('warnings'); const warningCode = code(); const why = parts.join(' ') || 'لم يتم تحديد سبب'; warnings[warningCode] = { userId: target.id, moderatorId: message.author.id, reason: why, at: new Date().toISOString() }; save('warnings', warnings); await sendLog(message.guild, 'moderation', 'تحذير عضو', moderationFields('تحذير', target, message.author, why, warningCode), 0xF1C40F); await reply({ embeds: [new EmbedBuilder().setTitle('تحذير جديد').setColor(0xF1C40F).setDescription(`تم تحذير ${target}.\nالسبب: ${why}\nكود التحذير: **${warningCode}**`)] }); return true; }
    if (name === 'untimeout') { await target.timeout(null, 'فك التايم أوت'); await reply('تم فك التايم أوت.'); return true; }
    const parsedDuration = durationMs(parts[0]);
    if (name === 'timeout') { if (!parsedDuration) { await reply('اكتب المدة ثم السبب، مثل: تايم اوت @عضو 20m السبب'); return true; } const why = parts.slice(1).join(' ') || 'إجراء إداري'; await target.timeout(parsedDuration, why); await sendLog(message.guild, 'moderation', 'تايم أوت لعضو', moderationFields('تايم أوت', target, message.author, why, parts[0]), 0xE67E22); await reply(`تم إعطاء ${target} تايم أوت لمدة ${parts[0]}.`); return true; }
    const why = parts[0] && durationMs(parts[0]) ? parts.slice(1).join(' ') || 'إجراء إداري' : parts.join(' ') || 'إجراء إداري';
    if (name === 'kick') await target.kick(why); else { await target.ban({ reason: why }); if (parts[0] && durationMs(parts[0])) setTimeout(() => message.guild.members.unban(target.id, 'انتهاء مدة الباند').catch(() => {}), durationMs(parts[0])); }
    await sendLog(message.guild, 'moderation', name === 'kick' ? 'طرد عضو' : 'حظر عضو', moderationFields(name === 'kick' ? 'طرد' : 'حظر', target, message.author, why, name === 'kick' ? null : (parts[0] && durationMs(parts[0]) ? parts[0] : null)), name === 'kick' ? 0xE67E22 : 0xE74C3C);
    await reply(`تم ${name === 'kick' ? 'طرد' : 'حظر'} ${target.user?.tag || target.tag}.`); return true; }

  return false;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once(Events.ClientReady, async ready => {
  console.log(`تم تشغيل البوت بنجاح: ${ready.user.tag}`);
  
  const channel = config.voiceChannelId && ready.channels.cache.get(config.voiceChannelId);
  if (channel?.isVoiceBased()) joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('جاري مزامنة وتحديث أوامر السلاش...');
    await rest.put(
      Routes.applicationCommands(ready.user.id),
      { body: slashCommandsData }
    );
    console.log('✅ تم إعداد أوامر السلاش بنجاح!');
  } catch (error) {
    console.error('❌ خطأ في تحديث أوامر السلاش:', error);
  }
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  if (message.channelId === FORWARD_SOURCE_CHANNEL_ID) {
    const targetChannel = await message.guild.channels.fetch(FORWARD_TARGET_CHANNEL_ID).catch(() => null);
    if (targetChannel?.isTextBased()) {
      await targetChannel.send({
        content: `**[رسالة من ${message.author.username}]:** ${message.content}`,
        files: [...message.attachments.values()]
      }).catch(err => console.error('فشل توجيه الرسالة:', err.message));
    }
  }

  const isAnswer = await handleGameAnswer(message);
  if (isAnswer) return;

  await handleTextCommand(message);
});

// ------------------- [ لوق حذف الرسائل ] -------------------
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;
  await sendLog(message.guild, 'messages', '🗑️ تم حذف رسالة', [
    { name: 'صاحب الرسالة', value: `${message.author} (${message.author?.tag || message.author?.id})`, inline: true },
    { name: 'الروم', value: `${message.channel}`, inline: true },
    { name: 'محتوى الرسالة', value: message.content || '[لا يوجد نص / تحتوي على ملحقات أو إمبد]', inline: false }
  ], 0xE74C3C);
});

// ------------------- [ لوق تعديل الرسائل ] -------------------
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  await sendLog(oldMessage.guild, 'messages', '✏️ تم تعديل رسالة', [
    { name: 'صاحب الرسالة', value: `${oldMessage.author} (${oldMessage.author?.tag})`, inline: true },
    { name: 'الروم', value: `${oldMessage.channel}`, inline: true },
    { name: 'الرسالة القديمة', value: oldMessage.content || '[لا يوجد نص]', inline: false },
    { name: 'الرسالة الجديدة', value: newMessage.content || '[لا يوجد نص]', inline: false },
    { name: 'رابط الرسالة', value: `[اضغط هنا للانتقال](${newMessage.url})`, inline: false }
  ], 0x3498DB);
});

// ------------------- [ لوق إنشاء الرومات ] -------------------
client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;
  await sendLog(channel.guild, 'channels', '➕ تم إنشاء روم جديدة', [
    { name: 'اسم الروم', value: channel.name, inline: true },
    { name: 'النوع', value: `${channel.type}`, inline: true },
    { name: 'المعرف (ID)', value: channel.id, inline: true }
  ], 0x2ECC71);
});

// ------------------- [ لوق تعديل الرومات ] -------------------
client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!oldChannel.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) {
    changes.push({ name: 'تغيير الاسم', value: `من: **${oldChannel.name}**\nإلى: **${newChannel.name}**` });
  }

  if (changes.length > 0) {
    await sendLog(newChannel.guild, 'channels', '⚙️ تم تعديل إعدادات روم', [
      { name: 'الروم', value: `${newChannel} (${newChannel.id})`, inline: false },
      ...changes
    ], 0xF1C40F);
  }
});

// ------------------- [ لوق حذف الرومات ] -------------------
client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  await sendLog(channel.guild, 'channels', '➖ تم حذف روم', [
    { name: 'اسم الروم المحذوف', value: channel.name, inline: true },
    { name: 'المعرف (ID)', value: channel.id, inline: true }
  ], 0xE74C3C);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong! السرعة: ${client.ws.ping}ms`, flags: 64 });
      return;
    }

    if (commandName === 'serverinfo') {
      await interaction.reply(`**${interaction.guild.name}**\nالأعضاء: ${interaction.guild.memberCount}\nالقنوات: ${interaction.guild.channels.cache.size}`);
      return;
    }

    if (commandName === 'points') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const balance = getPoints(targetUser.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`نقاط ${targetUser.username}`).setDescription(`الرصيد الحالي: **${balance}** نقطة.`).setColor(0x5865F2)] });
      return;
    }

    if (commandName === 'apply-open' || commandName === 'apply-close') {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: '❌ لا تملك صلاحية إدارة التقديم.', flags: 64 });
        return;
      }
      const state = load('application');
      state.open = commandName === 'apply-open';
      save('application', state);
      await interaction.reply(`تم ${state.open ? 'فتح' : 'إغلاق'} تقديم الإدارة.`);
      return;
    }

    if (commandName === 'apply') {
      const state = load('application');
      if (!state.open) {
        await interaction.reply({ content: '❌ التقديم مغلق حالياً، انتظر حتى يتم فتحه.', flags: 64 });
        return;
      }
      const applyEmbed = new EmbedBuilder().setTitle('📝 تقديم على الإدارة').setDescription('اضغط على الزر أسفله للبدء في تعبئة نموذج التقديم المتكون من 5 أسئلة.').setColor(0x3498DB);
      const applyRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_apply_modal').setLabel('بدء التقديم 📝').setStyle(ButtonStyle.Primary));
      await interaction.reply({ embeds: [applyEmbed], components: [applyRow] });
      return;
    }
  }

  if (interaction.isButton() && interaction.customId === 'start_apply_modal') {
    const state = load('application');
    if (!state.open) {
      await interaction.reply({ content: '❌ التقديم مغلق حالياً.', flags: 64 });
      return;
    }

    const modal = new ModalBuilder().setCustomId('apply_form_modal').setTitle('نموذج التقديم على الإدارة');
    const q1 = new TextInputBuilder().setCustomId('q_name').setLabel('1. الاسم والعمر').setStyle(TextInputStyle.Short).setRequired(true);
    const q2 = new TextInputBuilder().setCustomId('q_time').setLabel('2. كم ساعة تتواجد يومياً؟').setStyle(TextInputStyle.Short).setRequired(true);
    const q3 = new TextInputBuilder().setCustomId('q_exp').setLabel('3. هل لديك خبرات إدارية سابقة؟').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const q4 = new TextInputBuilder().setCustomId('q_why').setLabel('4. لماذا تريد الانضمام لفريقنا؟').setStyle(TextInputStyle.Paragraph).setRequired(true);
    const q5 = new TextInputBuilder().setCustomId('q_extra').setLabel('5. اقتراح أو كلمة إضافية').setStyle(TextInputStyle.Paragraph).setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(q1),
      new ActionRowBuilder().addComponents(q2),
      new ActionRowBuilder().addComponents(q3),
      new ActionRowBuilder().addComponents(q4),
      new ActionRowBuilder().addComponents(q5)
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'apply_form_modal') {
    const name = interaction.fields.getTextInputValue('q_name');
    const time = interaction.fields.getTextInputValue('q_time');
    const exp = interaction.fields.getTextInputValue('q_exp');
    const why = interaction.fields.getTextInputValue('q_why');
    const extra = interaction.fields.getTextInputValue('q_extra') || 'لا يوجد';

    const logChannel = await interaction.guild.channels.fetch(APPLY_LOG_CHANNEL_ID).catch(() => null);

    if (!logChannel || !logChannel.isTextBased()) {
      await interaction.reply({ content: '❌ فشل إرسال الطلب، تأكد من إعداد APPLY_LOG_CHANNEL_ID بشكل صحيح.', flags: 64 });
      return;
    }

    const resultEmbed = new EmbedBuilder()
      .setTitle('📋 طلب تقديم جديد')
      .setColor(0x2ECC71)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: 'المتقدم', value: `${interaction.user} (${interaction.user.tag})`, inline: false },
        { name: '1. الاسم والعمر', value: name, inline: true },
        { name: '2. ساعات التواجد', value: time, inline: true },
        { name: '3. الخبرات السابقة', value: exp, inline: false },
        { name: '4. سبب الانضمام', value: why, inline: false },
        { name: '5. إضافات', value: extra, inline: false }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [resultEmbed] });
    await interaction.reply({ content: '✅ تم إرسال طلب التقديم الخاص بك بنجاح للإدارة!', flags: 64 });
    return;
  }

  if (!interaction.isButton()) return;
  const customId = interaction.customId;

  if (customId.startsWith('rps_accept_') || customId.startsWith('rps_decline_')) {
    const action = customId.startsWith('rps_accept_') ? 'accept' : 'decline';
    const challengeId = customId.replace(`rps_${action}_`, '');
    const game = rpsChallenges.get(challengeId);

    if (!game) {
      await interaction.reply({ content: 'هذا التحدي لم يعد متاحاً.', flags: 64 });
      return;
    }

    if (interaction.user.id !== game.opponentId) {
      await interaction.reply({ content: 'عذراً، هذا التحدي ليس موجهاً لك!', flags: 64 });
      return;
    }

    if (action === 'decline') {
      rpsChallenges.delete(challengeId);
      await interaction.update({ content: 'تم رفض التحدي.', embeds: [], components: [] });
      return;
    }

    const gameRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rpschoice_rock_${challengeId}`).setLabel('حجر 🪨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpschoice_paper_${challengeId}`).setLabel('ورقة 📄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpschoice_scissors_${challengeId}`).setLabel('مقص ✂️').setStyle(ButtonStyle.Primary)
    );

    const gameEmbedMsg = new EmbedBuilder()
      .setTitle('🎮 بدأت المواجهة!')
      .setDescription(`المواجهة بين <@${game.challengerId}> و <@${game.opponentId}>\n\nالرجاء اختيار حركتك من الأزرار أدناه!`)
      .setColor(0xF1C40F);

    await interaction.update({ embeds: [gameEmbedMsg], components: [gameRow] });
    return;
  }

  if (customId.startsWith('rpschoice_')) {
    const parts = customId.split('_');
    const choice = parts[1];
    const challengeId = parts[2];
    const game = rpsChallenges.get(challengeId);

    if (!game) {
      await interaction.reply({ content: 'هذه اللعبة انتهت.', flags: 64 });
      return;
    }

    if (interaction.user.id !== game.challengerId && interaction.user.id !== game.opponentId) {
      await interaction.reply({ content: 'أنت لست طرفاً في هذا التحدي!', flags: 64 });
      return;
    }

    game.choices[interaction.user.id] = choice;

    if (!game.choices[game.challengerId] || !game.choices[game.opponentId]) {
      await interaction.reply({ content: `تم تسجيل اختيارك! في انتظار الطرف الآخر...`, flags: 64 });
      return;
    }

    const cChoice = game.choices[game.challengerId];
    const oChoice = game.choices[game.opponentId];

    let winner = null;
    if (cChoice === oChoice) winner = 'tie';
    else if (
      (cChoice === 'rock' && oChoice === 'scissors') ||
      (cChoice === 'paper' && oChoice === 'rock') ||
      (cChoice === 'scissors' && oChoice === 'paper')
    ) {
      winner = game.challengerId;
    } else {
      winner = game.opponentId;
    }

    const translate = { rock: 'حجر 🪨', paper: 'ورقة 📄', scissors: 'مقص ✂️' };
    const resultText = winner === 'tie'
      ? 'تعادل! كلاهما اختار نفس الحركة.'
      : `الفائز هو <@${winner}>! 🎉`;

    const resultEmbed = new EmbedBuilder()
      .setTitle('🎮 نتيجة لعبة حجرة ورقة مقص')
      .setDescription(`<@${game.challengerId}> اختار: **${translate[cChoice]}**\n<@${game.opponentId}> اختار: **${translate[oChoice]}**\n\n**${resultText}**`)
      .setColor(winner === 'tie' ? 0xF1C40F : 0x2ECC71);

    await interaction.update({ embeds: [resultEmbed], components: [] });
    rpsChallenges.delete(challengeId);
  }
});

client.login(process.env.DISCORD_TOKEN);