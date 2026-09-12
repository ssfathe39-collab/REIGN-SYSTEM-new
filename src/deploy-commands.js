require('dotenv').config();

const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const required = ['DISCORD_TOKEN', 'CLIENT_ID'];
const missing = required.filter(name => !process.env[name]);

if (missing.length > 0) {
  console.error(`متغيرات البيئة الناقصة: ${missing.join(', ')}`);
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.GUILD_ID
  ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
  : Routes.applicationCommands(process.env.CLIENT_ID);

rest.put(route, { body: commands })
  .then(() => console.log('تم تسجيل أوامر الإدارة بنجاح.'))
  .catch(error => {
    console.error('فشل تسجيل الأوامر:', error);
    process.exitCode = 1;
  });