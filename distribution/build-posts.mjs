#!/usr/bin/env node
// Собирает CSV расписания постов для Publer из трёх источников:
//   games.json            — расписание и слаги хаба (истина, когда день заполнен)
//   distribution/schedule.json — провизорный порядок для ещё не назначенных дней
//   distribution/posts.json    — тексты RU/EN
//
// Без зависимостей, как build-games.mjs.
//
//   node distribution/build-posts.mjs
//   node distribution/build-posts.mjs --start 2026-10-01 --out distribution/publer-posts.csv

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Заголовки колонок вынесены сюда намеренно: у Publer формат bulk-импорта
// периодически меняется, и подгонка под него должна быть правкой одной строки,
// а не переписыванием генератора. Сверь их с тем, что просит импортёр, на
// первом же тестовом заливе.
const COLUMNS = ['Date', 'Time', 'Accounts', 'Language', 'Type', 'Game', 'Text', 'Link', 'Media', 'Labels'];

// utm_source попадает в аналитику как есть: hub.js возвращает его из
// trafficSource() без преобразований. utm_medium несёт тёплый/холодный трафик.
const CHANNELS = [
  { name: 'TikTok', utm: 'tiktok', medium: 'cold', lang: 'en' },
  { name: 'YouTube Shorts', utm: 'youtube', medium: 'cold', lang: 'en' },
  { name: 'Instagram', utm: 'instagram', medium: 'cold', lang: 'en' },
  { name: 'X', utm: 'x', medium: 'warm', lang: 'en' },
  { name: 'Bluesky', utm: 'bluesky', medium: 'warm', lang: 'en' },
  { name: 'Threads', utm: 'threads', medium: 'warm', lang: 'en' },
  { name: 'LinkedIn', utm: 'linkedin', medium: 'warm', lang: 'en' },
  { name: 'Telegram', utm: 'telegram', medium: 'warm', lang: 'ru' }
];

const HUB = 'https://play.hrytsko.com';
const TIME_TODAY = '19:00';
const TIME_TEASER = '21:00';
const X_LIMIT = 280;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const games = readJson(join(root, 'games.json'));
const { schedule } = readJson(join(here, 'schedule.json'));
const { posts, campaign, hashtagEn, hashtagRu } = readJson(join(here, 'posts.json'));

const startDate = arg('--start', games.project.startDate);
const outPath = arg('--out', join(here, 'publer-posts.csv'));

// Слаг хаба и слаг спеки — разные пространства имён (спека box-arrives выходит
// на хабе как incoming-box). Тексты лежат под слагом спеки, ссылка строится по
// слагу хаба, если день уже заполнен в games.json.
const hubSlugByDay = new Map(
  games.games.filter((g) => g.slug).map((g) => [g.day, g.slug])
);

const rows = [];
const warnings = [];

for (let day = 1; day <= 30; day += 1) {
  const specSlug = schedule[day];
  if (!specSlug) {
    warnings.push(`день ${day}: нет игры в schedule.json`);
    continue;
  }
  const text = posts[specSlug];
  if (!text) {
    warnings.push(`день ${day}: нет текстов для «${specSlug}» в posts.json`);
    continue;
  }

  const hubSlug = hubSlugByDay.get(day) || specSlug;
  const provisional = hubSlugByDay.has(day) ? '' : 'provisional';
  const dayDate = addDays(startDate, day - 1);

  for (const channel of CHANNELS) {
    const t = text[channel.lang];
    const hashtag = channel.lang === 'ru' ? hashtagRu : hashtagEn;

    const utm = (content) =>
      `utm_source=${channel.utm}&utm_medium=${channel.medium}` +
      `&utm_campaign=${campaign}&utm_content=${content}`;

    const dayNum = String(day).padStart(2, '0');

    // «Сегодня»: {название} — {правило}. {ссылка}
    const todayLink = `${HUB}/${hubSlug}/?${utm(`day-${dayNum}-today`)}`;
    rows.push({
      Date: dayDate,
      Time: TIME_TODAY,
      Accounts: channel.name,
      Language: channel.lang,
      Type: 'today',
      Game: `${dayNum} ${t.title}`,
      Text: `${t.title} — ${t.today}\n\n${todayLink}\n${hashtag}`,
      Link: todayLink,
      Media: `clips/${dayNum}.mp4`,
      Labels: [`day-${dayNum}`, 'today', channel.medium, provisional].filter(Boolean).join(' ')
    });

    // «Завтра»: {правило}. Завтра на сайте. {ссылка на карточку завтра}
    // Тизер уходит накануне вечером, поэтому у дня 1 он попадает на день −1 —
    // тот самый день анонса из строки 14 конвейера.
    const teaserLink = `${HUB}/?${utm(`day-${dayNum}-tomorrow`)}#upcoming-title`;
    const teaserTail = channel.lang === 'ru' ? 'Завтра на сайте.' : 'Tomorrow on the site.';
    rows.push({
      Date: addDays(dayDate, -1),
      Time: TIME_TEASER,
      Accounts: channel.name,
      Language: channel.lang,
      Type: 'tomorrow',
      Game: `${dayNum} ${t.title}`,
      Text: `${t.tomorrow}\n\n${teaserTail}\n${teaserLink}\n${hashtag}`,
      Link: teaserLink,
      Media: '',
      Labels: [`day-${dayNum}`, 'tomorrow', channel.medium, provisional].filter(Boolean).join(' ')
    });
  }
}

const tooLongForX = rows.filter((r) => r.Accounts === 'X' && r.Text.length > X_LIMIT);
if (tooLongForX.length) {
  warnings.push(
    `${tooLongForX.length} постов для X длиннее ${X_LIMIT} символов: ` +
      tooLongForX.map((r) => `${r.Game}/${r.Type}`).join(', ')
  );
}

const csv = [COLUMNS.join(',')]
  .concat(rows.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(',')))
  .join('\n');

writeFileSync(outPath, `${csv}\n`);

const slots = rows.length / CHANNELS.length;
console.log(`Старт: ${startDate} (${games.project.timeZone})`);
console.log(`Постов-слотов: ${slots} (30 «сегодня» + 30 «завтра»)`);
console.log(`Строк в CSV: ${rows.length} — по одной на канал, ${CHANNELS.length} каналов`);
console.log(`Записано: ${outPath}`);
const provisionalDays = 30 - hubSlugByDay.size;
if (provisionalDays > 0) {
  console.log(
    `Провизорных дней: ${provisionalDays} — порядок взят из schedule.json, ` +
      'в games.json у них ещё нет слага. Строки помечены меткой provisional.'
  );
}
if (warnings.length) {
  console.log('\nПредупреждения:');
  warnings.forEach((w) => console.log(`  - ${w}`));
}
