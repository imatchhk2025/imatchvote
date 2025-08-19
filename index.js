// index.js
import http from 'http';
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
  })
  .listen(PORT, () => console.log(`🌐 Keep-alive server running on :${PORT}`));

import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, PermissionsBitField, SlashCommandBuilder, REST
} from 'discord.js';
import cron from 'node-cron';
import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';
import fs from 'fs';

dayjs.extend(utc);
dayjs.extend(tz);

/** ===================== Config ===================== **/
const {
  DISCORD_TOKEN, CLIENT_ID, GUILD_ID,
  CRON_HOUR = '9',
  CRON_MINUTE = '0',
  TIMEZONE = 'Asia/Hong_Kong',
  GOOGLE_SHEETS_ENABLED = 'true',
} = process.env;

// 如要「完全不依賴 Google Sheets」→ 設 true
const FORCE_SAFE_MODE = false;

// Sheets helper（可選）
const SHEETS_ENABLED = GOOGLE_SHEETS_ENABLED === 'true' && !FORCE_SAFE_MODE;
let sheetHelper = null;
if (SHEETS_ENABLED) {
  try {
    const mod = await import('./sheets/googleSheets.js');
    sheetHelper = mod.default;
  } catch (e) {
    console.warn('⚠️ Sheets helper 載入失敗，將不使用 Sheets：', e?.message || e);
  }
}
const hasSheets = () => !!sheetHelper && SHEETS_ENABLED;

/** ===================== DB 初始化 ===================== **/
if (!fs.existsSync('db')) fs.mkdirSync('db');
const db = new Database('db/polls.db');
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT,
  channel_id TEXT,
  question_a TEXT,
  question_b TEXT,
  tag TEXT,
  start_at TEXT,
  end_at TEXT,
  is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS votes (
  poll_id INTEGER,
  user_id TEXT,
  choice TEXT,
  voted_at TEXT,
  PRIMARY KEY (poll_id, user_id)
);
`);

/** ===================== 題庫（本地後備） ===================== **/
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync('./questions.json', 'utf-8'));
} catch {
  questions = [
    { a: '出街食飯', b: '叫外賣返屋企', tag: 'food' },
    { a: '聽歌', b: '追劇', tag: 'entertainment' },
    { a: '搭叮叮', b: '搭小巴', tag: 'transport' },
  ];
}

/** ===================== Discord Client ===================== **/
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

/** ===================== Slash Commands ===================== **/
const commands = [
  new SlashCommandBuilder()
    .setName('set-channel')
    .setDescription('設定每日投票發佈頻道')
    .addChannelOption(opt => opt.setName('channel').setDescription('目標頻道').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  new SlashCommandBuilder().setName('poll-now').setDescription('立即隨機出一題 2選1 投票'),

  new SlashCommandBuilder().setName('reload-questions').setDescription('重新載入題庫（Sheets 啟用時從雲端讀取）'),

  new SlashCommandBuilder()
    .setName('add-question')
    .setDescription('加入新題目（A/B）')
    .addStringOption(o => o.setName('a').setDescription('選項 A').setRequired(true))
    .addStringOption(o => o.setName('b').setDescription('選項 B').setRequired(true))
    .addStringOption(o => o.setName('tag').setDescription('分類 tag').setRequired(false)),

  new SlashCommandBuilder().setName('my-stats').setDescription('DM 你個人投票統計（Safe Mode 只回提示）'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
async function registerCommands() {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Command register error:', error);
  }
}

/** ===================== Utils ===================== **/
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const nowHK = () => dayjs().tz(TIMEZONE).toISOString();

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
function tally(pollId) {
  const rows = db.prepare('SELECT choice, COUNT(*) as c FROM votes WHERE poll_id = ? GROUP BY choice').all(pollId);
  let a = 0, b = 0;
  for (const r of rows) {
    if (r.choice === 'A') a = r.c;
    if (r.choice === 'B') b = r.c;
  }
  const total = a + b;
  const aPct = total ? a / total : 0;
  const bPct = total ? b / total : 0;
  return { a, b, aPct, bPct, total };
}
function getActivePollByMessage(messageId) {
  return db.prepare('SELECT * FROM polls WHERE message_id = ? AND is_active = 1').get(messageId);
}

/** 顯示「即時/最終結果」的 Embed（含題目與選項） **/
function buildResultsEmbed(poll, stats, { final = false } = {}) {
  const title = final ? '最終結果' : '即時結果';
  const endAt = dayjs(poll.end_at).tz(TIMEZONE).format('YYYY年MM月DD日 HH:mm z');

  return new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setDescription([
      '**題目**',
      `A. ${poll.question_a}`,
      `B. ${poll.question_b}`
    ].join('\n'))
    .addFields(
      { name: '統計', value: [
        `A：${stats.a}（${pct(stats.aPct)}）`,
        `B：${stats.b}（${pct(stats.bPct)}）`,
        `總票數：${stats.total}`
      ].join('\n') },
      ...(final ? [{ name: '截止時間', value: endAt }] : [])
    )
    .setColor(final ? 0x2ECC71 : 0x5865F2)
    .setTimestamp(new Date());
}

async function pickQuestion() {
  try {
    if (hasSheets()) {
      const list = await sheetHelper.getQuestions();
      if (list?.length) return list[Math.floor(Math.random() * list.length)];
    }
  } catch (e) {
    console.warn('⚠️ 取題（Sheets）失敗，改用本地：', e?.message || e);
  }
  return questions[Math.floor(Math.random() * questions.length)];
}

async function refreshMessage(message, poll) {
  try {
    const { a, b, aPct, bPct } = tally(poll.id);
    const endAt = dayjs(poll.end_at).tz(TIMEZONE);

    const embed = new EmbedBuilder()
      .setTitle('每日 2選1 投票')
      .setDescription(`**A. ${poll.question_a}**\n**B. ${poll.question_b}**`)
      .addFields(
        { name: '投票狀態', value: `A：${a}（${pct(aPct)}）\nB：${b}（${pct(bPct)}）` },
        { name: '截止時間', value: endAt.format('YYYY年MM月DD日 HH:mm z') }
      )
      .setFooter({ text: '匿名投票｜每人限投一次（可更改選擇）' })
      .setTimestamp(new Date())
      .setColor(0x5865F2);

    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('refreshMessage error:', error);
  }
}

async function postPoll(channelId, qA, qB, tag, durationMins = 1440) {
  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error('Channel not found');

  // 確認權限：SendMessages + EmbedLinks
  const me = await channel.guild.members.fetch(client.user.id);
  const perms = channel.permissionsFor(me);
  if (!perms?.has(['SendMessages', 'EmbedLinks'])) {
    throw new Error(`Missing channel permissions: SendMessages, EmbedLinks in ${channel.name} (${channel.id})`);
  }

  const endAt = dayjs().tz(TIMEZONE).add(durationMins, 'minute');

  const embed = new EmbedBuilder()
    .setTitle('每日 2選1 投票')
    .setDescription(`**A. ${qA}**\n**B. ${qB}**`)
    .addFields(
      { name: '投票狀態', value: 'A：0（0.0%）\nB：0（0.0%）' },
      { name: '截止時間', value: endAt.format('YYYY年MM月DD日 HH:mm z') }
    )
    .setFooter({ text: '匿名投票｜每人限投一次（可更改選擇）' })
    .setTimestamp(new Date())
    .setColor(0x5865F2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vote_A').setLabel('投 A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vote_B').setLabel('投 B').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_result').setLabel('查看結果').setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });

  db.prepare(`
    INSERT INTO polls (message_id, channel_id, question_a, question_b, tag, start_at, end_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    msg.id, channelId, qA, qB, tag || null,
    nowHK(), endAt.toISOString()
  );

  // 可選：記錄到 Sheets（以免阻塞，做 soft 方式）
  if (hasSheets()) {
    try {
      const pollId = db.prepare('SELECT id FROM polls WHERE message_id = ?').get(msg.id)?.id;
      const task = sheetHelper.logVoterData({
        type: 'poll_created',
        timestamp: nowHK(),
        pollId, channelId, messageId: msg.id,
        questionA: qA, questionB: qB, tag: tag || '',
        pollStart: nowHK(), pollEnd: endAt.format(),
        durationHours: Math.round((durationMins / 60) * 10) / 10
      });
      await Promise.race([task, new Promise(r => setTimeout(r, 1500))]);
    } catch (e) {
      console.warn('⚠️ Sheets 記錄 poll_created 失敗：', e?.message || e);
    }
  }

  console.log(`📊 Poll: "${qA}" vs "${qB}" → ${endAt.format()}`);
  return msg;
}

async function closeExpiredPolls() {
  const now = dayjs().tz(TIMEZONE);
  const active = db.prepare('SELECT * FROM polls WHERE is_active = 1').all();

  for (const p of active) {
    if (now.isAfter(dayjs(p.end_at))) {
      db.prepare('UPDATE polls SET is_active = 0 WHERE id = ?').run(p.id);
      try {
        const channel = await client.channels.fetch(p.channel_id);
        const msg = await channel.messages.fetch(p.message_id);

        // 原投票卡：改 footer & 移除按鈕
        const embed = EmbedBuilder.from(msg.embeds[0])
          .setFooter({ text: '投票已結束（匿名）' })
          .setColor(0x99AAB5);
        await msg.edit({ embeds: [embed], components: [] });

        // 公佈最終結果（題目 + 選項）
        const stats = tally(p.id);
        const finalEmbed = buildResultsEmbed(p, stats, { final: true });
        await channel.send({ embeds: [finalEmbed] });

        // Sheets 紀錄
        if (hasSheets())) {
          try {
            const startTime = dayjs(p.start_at).tz(TIMEZONE);
            const endTime = dayjs().tz(TIMEZONE);
            const durationHours = endTime.diff(startTime, 'hour', true);

            const task = sheetHelper.logVoterData({
              type: 'poll_closed',
              timestamp: endTime.format(),
              pollId: p.id, messageId: p.message_id, channelId: p.channel_id,
              questionA: p.question_a, questionB: p.question_b, tag: p.tag || '',
              a: stats.a, b: stats.b, aPct: stats.aPct, bPct: stats.bPct, totalVotes: stats.total,
              pollStart: startTime.format(), pollEnd: endTime.format(),
              durationHours: Math.round(durationHours * 10) / 10
            });
            await Promise.race([task, new Promise(r => setTimeout(r, 1500))]);
          } catch (e) {
            console.warn('⚠️ Sheets 記錄 poll_closed 失敗：', e?.message || e);
          }
        }

        console.log(`✅ Poll closed: "${p.question_a}" vs "${p.question_b}"`);
      } catch (e) {
        console.error('closeExpiredPolls error:', e);
      }
    }
  }
}

/** ===================== Ready ===================== **/
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();

  cron.schedule('* * * * *', closeExpiredPolls, { timezone: TIMEZONE });
  console.log('🕒 Poll expiry checker scheduled (every minute)');

  const cronExp = `${CRON_MINUTE} ${CRON_HOUR} * * *`;
  cron.schedule(cronExp, async () => {
    const channelId = getSetting('poll_channel_id');
    if (!channelId) return console.log('❌ 未設定出題頻道（/set-channel）');
    try {
      const q = await pickQuestion();
      await postPoll(channelId, q.a, q.b, q.tag, 1440);
      console.log(`📅 Daily poll posted at ${dayjs().tz(TIMEZONE).format()}`);
    } catch (e) {
      console.error('Daily post error:', e);
    }
  }, { timezone: TIMEZONE });
  console.log(`📅 Daily poll scheduled: ${cronExp} (${TIMEZONE})`);
});

/** ===================== Interactions ===================== **/
client.on('interactionCreate', async (i) => {
  const safeDeferReply = async () => {
    try { if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true }); } catch {}
  };
  const safeEditReply = async (payload) => {
    try {
      if (i.deferred) await i.editReply(payload);
      else if (!i.replied) await i.reply({ ...payload, ephemeral: true });
      else await i.followUp({ ...payload, ephemeral: true });
    } catch {}
  };

  try {
    // ----- Buttons -----
    if (i.isButton()) {
      await safeDeferReply();

      if (i.customId === 'vote_A' || i.customId === 'vote_B') {
        const poll = getActivePollByMessage(i.message.id);
        if (!poll) { await safeEditReply({ content: '呢個投票已經完結。' }); return; }

        const choice = i.customId === 'vote_A' ? 'A' : 'B';

        try {
          db.prepare(`
            INSERT INTO votes (poll_id, user_id, choice, voted_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(poll_id, user_id)
            DO UPDATE SET choice = excluded.choice, voted_at = excluded.voted_at
          `).run(poll.id, i.user.id, choice, nowHK());
        } catch (e) {
          console.error('DB 寫入投票錯誤：', e);
          await safeEditReply({ content: '❌ 寫入投票失敗，請再試一次。' });
          return;
        }

        // 更新投票卡片
        try { await refreshMessage(i.message, poll); } catch (e) { console.error('refreshMessage:', e); }

        // Sheets 記錄（非阻塞）
        if (hasSheets()) {
          try {
            const t = tally(poll.id);
            const task = sheetHelper.logVoterData({
              type: 'vote',
              timestamp: nowHK(),
              pollId: poll.id, messageId: poll.message_id, channelId: poll.channel_id,
              userId: i.user.id, username: i.user.username, choice,
              questionA: poll.question_a, questionB: poll.question_b, tag: poll.tag || '',
              a: t.a, b: t.b, aPct: t.aPct, bPct: t.bPct, totalVotes: t.total,
              pollStart: poll.start_at, pollEnd: poll.end_at
            });
            await Promise.race([task, new Promise(r => setTimeout(r, 800))]);
          } catch {}
        }

        await safeEditReply({ content: `✅ 已記錄你投 **${choice}**（可以再改）` });
        return;
      }

      if (i.customId === 'show_result') {
        const poll = getActivePollByMessage(i.message.id);
        if (!poll) { await safeEditReply({ content: '呢個投票已經完結。' }); return; }

        const stats = tally(poll.id);
        const embed = buildResultsEmbed(poll, stats, { final: false });
        await safeEditReply({ embeds: [embed] });
        return;
      }

      await safeEditReply({ content: '🤔 未識別的按鈕。' });
      return;
    }

    // ----- Slash commands -----
    if (!i.isChatInputCommand()) return;
    await safeDeferReply();

    if (i.commandName === 'set-channel') {
      const ch = i.options.getChannel('channel');
      setSetting('poll_channel_id', ch.id);
      await safeEditReply({ content: `✅ 已設定每日投票頻道為 <#${ch.id}>。` });
      return;
    }

    if (i.commandName === 'poll-now') {
      try {
        const channelId = getSetting('poll_channel_id') || i.channelId;
        const q = await pickQuestion();
        await postPoll(channelId, q.a, q.b, q.tag, 1440);
        await safeEditReply({ content: '✅ 已發佈一條即時投票（24 小時）。' });
      } catch (e) {
        console.error('/poll-now error:', e);
        await safeEditReply({ content: '❌ 發佈投票失敗（請檢查頻道權限/嵌入訊息）。' });
      }
      return;
    }

    if (i.commandName === 'reload-questions') {
      try {
        if (hasSheets()) {
          const list = await sheetHelper.getQuestions();
          const minimal = list.map(q => ({ a: q.a, b: q.b, tag: q.tag || null }));
          fs.writeFileSync('./questions.json', JSON.stringify(minimal, null, 2));
          await safeEditReply({ content: `✅ 題庫已從 Google Sheets 重新載入，共 ${list.length} 條。` });
        } else {
          const minimal = questions.map(q => ({ a: q.a, b: q.b, tag: q.tag || null }));
          fs.writeFileSync('./questions.json', JSON.stringify(minimal, null, 2));
          await safeEditReply({ content: `✅ 題庫已重新載入（本地），共 ${minimal.length} 條。` });
        }
      } catch (e) {
        console.error('reload-questions error:', e);
        await safeEditReply({ content: '❌ 載入題庫失敗。' });
      }
      return;
    }

    if (i.commandName === 'add-question') {
      const a = i.options.getString('a');
      const b = i.options.getString('b');
      const tag = i.options.getString('tag') || null;

      let ok = false;
      if (hasSheets()) { try { ok = await sheetHelper.addQuestion(a, b, tag); } catch {} }
      if (!ok) {
        questions.push({ a, b, tag });
        try { fs.writeFileSync('./questions.json', JSON.stringify(questions, null, 2)); } catch {}
      }
      await safeEditReply({ content: `✅ 已加入題目：A. ${a} | B. ${b}${tag ? `（tag: ${tag}）` : ''}` });
      return;
    }

    if (i.commandName === 'my-stats') {
      await safeEditReply({ content: '📊 Safe Mode 下只提供基本提示（如需完整統計，稍後可啟用 Sheets）。' });
      return;
    }

    await safeEditReply({ content: '🤔 未識別的指令。' });
  } catch (err) {
    console.error('interactionCreate fatal:', err);
    try {
      if (!i.replied && !i.deferred) await i.reply({ content: '抱歉，發生錯誤。', ephemeral: true });
      else await i.followUp({ content: '抱歉，發生錯誤。', ephemeral: true });
    } catch {}
  }
});

/** ===================== Errors ===================== **/
client.on('error', e => console.error('Discord client error:', e));
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));
client.on('shardDisconnect', (e, id) => console.warn('[GW] shardDisconnect', id, e?.code));
client.on('shardError', (e, id) => console.error('[GW] shardError', id, e?.message || e));
client.on('shardReconnecting', id => console.warn('[GW] shardReconnecting', id));
client.on('shardResume', (id, replayed) => console.warn('[GW] shardResume', id, 'replayed:', replayed));

/** ===================== Login ===================== **/
client.login(DISCORD_TOKEN);
