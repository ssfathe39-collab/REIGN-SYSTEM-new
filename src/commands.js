const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const user = option => option.setName('user').setDescription('العضو').setRequired(true);
const reason = option => option.setName('reason').setDescription('السبب');
const commands = [
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').addUserOption(user).addStringOption(o => o.setName('duration').setDescription('مدة اختيارية مثل 10d')).addStringOption(reason).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('unban').setDescription('فك حظر عضو').addStringOption(o => o.setName('user_id').setDescription('معرف العضو المحظور').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').addUserOption(user).addStringOption(reason).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('timeout').setDescription('تايم أوت لعضو').addUserOption(user).addStringOption(o => o.setName('duration').setDescription('10m أو 2h أو 1d').setRequired(true)).addStringOption(reason).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('untimeout').setDescription('فك التايم أوت').addUserOption(user).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('serverinfo').setDescription('معلومات السيرفر'),
  new SlashCommandBuilder().setName('addrole').setDescription('إعطاء رول').addUserOption(user).addRoleOption(o => o.setName('role').setDescription('الرول').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('removerole').setDescription('إزالة رول').addUserOption(user).addRoleOption(o => o.setName('role').setDescription('الرول').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('lock').setDescription('إغلاق الروم').addChannelOption(o => o.setName('channel').setDescription('الروم').addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('فتح الروم').addChannelOption(o => o.setName('channel').setDescription('الروم').addChannelTypes(ChannelType.GuildText)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('warn').setDescription('تحذير عضو').addUserOption(user).addStringOption(o => o.setName('reason').setDescription('السبب').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('unwarn').setDescription('إزالة تحذير بكوده').addStringOption(o => o.setName('code').setDescription('كود التحذير').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warnings').setDescription('عرض التحذيرات').addUserOption(o => o.setName('user').setDescription('عضو معين')), 
  new SlashCommandBuilder().setName('temprole').setDescription('إعطاء رول مؤقت').addUserOption(user).addRoleOption(o => o.setName('role').setDescription('الرول').setRequired(true)).addStringOption(o => o.setName('duration').setDescription('10m أو 2h أو 1d').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('leaderboard').setDescription('أفضل 10 متفاعلين'),
  new SlashCommandBuilder().setName('nickname').setDescription('تغيير اسم مستعار في السيرفر').addUserOption(user).addStringOption(o => o.setName('name').setDescription('الاسم الجديد').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder().setName('giveaway').setDescription('بدء قيفاواي').addStringOption(o => o.setName('prize').setDescription('الجائزة').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('المدة بالدقائق').setMinValue(1).setMaxValue(10080).setRequired(true)).addIntegerOption(o => o.setName('winners').setDescription('عدد الفائزين').setMinValue(1).setMaxValue(20).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('apply-open').setDescription('فتح تقديم الإدارة').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('apply-close').setDescription('إغلاق تقديم الإدارة').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('apply').setDescription('فتح نموذج التقديم للإدارة'),
  new SlashCommandBuilder().setName('points').setDescription('إعطاء أو خصم نقاط').addUserOption(user).addIntegerOption(o => o.setName('amount').setDescription('موجب للإعطاء وسالب للخصم').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('deduct-points').setDescription('خصم نقاط XP من عضو').addUserOption(user).addIntegerOption(o => o.setName('amount').setDescription('عدد النقاط المراد خصمها').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('joinvoice').setDescription('إدخال البوت للروم الصوتي').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('game-ctweet').setDescription('كت تويت بسؤال عشوائي'),
  new SlashCommandBuilder().setName('game-fastest').setDescription('أسرع شخص يضغط الزر'),
  new SlashCommandBuilder().setName('game-flags').setDescription('تعرف على أعلام الدول'),
  new SlashCommandBuilder().setName('game-words').setDescription('لعبة جمع الكلمات'),
  new SlashCommandBuilder().setName('game-rps').setDescription('لعبة الطوبة').addUserOption(o => o.setName('user').setDescription('الخصم').setRequired(true)),
  new SlashCommandBuilder().setName('game-shooting').setDescription('لعبة إطلاق النار الجماعية')
];

module.exports = commands.map(command => command.toJSON());