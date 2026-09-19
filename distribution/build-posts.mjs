#!/usr/bin/env node
// Собирает CSV расписания постов для Publer из трёх источников:
//   games.json              — расписание: день → слаг
//   specs/NN-<slug>.md      — название и правило одной фразой (шапка спеки)
//   distribution/posts.json — тизеры «завтра» и посты прогрева, RU/EN
//
// Название и правило не дублируются здесь намеренно: они живут в шапке спеки,
// оттуда же их берёт хаб. В posts.json остаётся только то, что действительно
// пишется отдельно — интрига на вечер накануне.
//
// Без зависимостей, как build-games.mjs.
//
//   node distribution/build-posts.mjs
//   node distribution/build-posts.mjs --start 2026-10-01 --out distribution/publer-posts.csv

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecs } from '../specs/front-matter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Заголовки колонок вынесены сюда намеренно: у Publer формат bulk-импорта
// периодически меняется, и подгонка под него должна быть правкой одной строки,
// а не переписыванием генератора. Сверь их с тем, что просит импортёр, на
// первом же тестовом заливе.
const COLUMNS = ['Date', 'Time', 'Accounts', 'Language', 'Type', 'Game', 'Text', 'Link', 'Media', 'Labels'];

// utm_source попадает в аналитику как есть: hub.js возвращает его из
// trafficSource() без преобразований. utm_medium несёт тёплый/холодный трафик.
// needsMedia: канал не принимает пост без видео, поэтому текстовые посты
// прогрева туда не уходят. length: какой вариант текста прогрева брать —
// короткий под лимит X или длинный для ленты, где длинный текст читают.
const CHANNELS = [
  { name: 'TikTok', utm: 'tiktok', medium: 'cold', lang: 'en', needsMedia: true, length: 'short' },
  { name: 'YouTube Shorts', utm: 'youtube', medium: 'cold', lang: 'en', needsMedia: true, length: 'short' },
  { name: 'Instagram', utm: 'instagram', medium: 'cold', lang: 'en', needsMedia: true, length: 'short' },
  { name: 'X', utm: 'x', medium: 'warm', lang: 'en', needsMedia: false, length: 'short' },
  { name: 'Bluesky', utm: 'bluesky', medium: 'warm', lang: 'en', needsMedia: false, length: 'short' },
  { name: 'Threads', utm: 'threads', medium: 'warm', lang: 'en', needsMedia: false, length: 'short' },
  { name: 'LinkedIn', utm: 'linkedin', medium: 'warm', lang: 'en', needsMedia: false, length: 'long' },
  { name: 'Telegram', utm: 'telegram', medium: 'warm', lang: 'ru', needsMedia: false, length: 'long' }
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
const specs = loadSpecs(join(root, 'specs'));
const { teasers, warmup, campaign, hashtagEn, hashtagRu } = readJson(join(here, 'posts.json'));

const startDate = arg('--start', games.project.startDate);
const outPath = arg('--out', join(here, 'publer-posts.csv'));

// Один слаг на игру: имя файла спеки, ключ в posts.json и адрес на хабе — это
// одна и та же строка. Раньше их было две, и день 1 успел разойтись; теперь за
// совпадением следит specs/validate.mjs в CI.
const byDay = new Map(games.games.filter((g) => g.slug).map((g) => [g.day, g]));

const rows = [];
const warnings = [];

// Прогрев: посты до дня 1. Идут первыми, чтобы в CSV сохранялся ход времени.
for (const post of warmup || []) {
  const date = addDays(startDate, post.offset);
  for (const channel of CHANNELS) {
    if (post.channels === 'text' && channel.needsMedia) continue;

    const utm =
      `utm_source=${channel.utm}&utm_medium=${channel.medium}` +
      `&utm_campaign=${campaign}&utm_content=warmup-${post.id}`;
    const link = `${HUB}/?${utm}`;
    const hashtag = channel.lang === 'ru' ? hashtagRu : hashtagEn;
    const body = post[channel.lang][channel.length];

    rows.push({
      Date: date,
      Time: post.time,
      Accounts: channel.name,
      Language: channel.lang,
      Type: 'warmup',
      Game: `— ${post.id}`,
      Text: `${body}\n\n${link}\n${hashtag}`,
      Link: link,
      Media: channel.needsMedia ? 'clips/teaser.mp4' : '',
      Labels: [`warmup-${post.id}`, `day${post.offset}`, channel.medium].join(' ')
    });
  }
}

for (let day = 1; day <= 30; day += 1) {
  const game = byDay.get(day);
  if (!game) {
    warnings.push(`день ${day}: нет слага в games.json`);
    continue;
  }
  const slug = game.slug;
  const spec = specs.get(slug);
  if (!spec) {
    warnings.push(`день ${day}: нет спеки specs/*-${slug}.md`);
    continue;
  }
  const teaser = teasers[slug];
  if (!teaser) {
    warnings.push(`день ${day}: нет тизера для «${slug}» в posts.json`);
    continue;
  }

  // Порядок дней считается решённым, как только день перестаёт быть planned.
  const provisional = game.status === 'planned' ? 'provisional' : '';
  const dayDate = addDays(startDate, day - 1);

  for (const channel of CHANNELS) {
    const t = {
      title: spec.meta[`title_${channel.lang}`],
      today: spec.meta[`pitch_${channel.lang}`],
      tomorrow: teaser[channel.lang],
    };
    const hashtag = channel.lang === 'ru' ? hashtagRu : hashtagEn;

    const utm = (content) =>
      `utm_source=${channel.utm}&utm_medium=${channel.medium}` +
      `&utm_campaign=${campaign}&utm_content=${content}`;

    const dayNum = String(day).padStart(2, '0');

    // «Сегодня»: {название} — {правило}. {ссылка}
    const todayLink = `${HUB}/${slug}/?${utm(`day-${dayNum}-today`)}`;
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

// X считает любую ссылку за 23 символа независимо от её реальной длины
// (t.co), поэтому мерить текст как есть — значит поднимать ложную тревогу на
// каждом посте: одни только utm-хвосты у нас длиннее сотни символов.
const xLength = (text) => text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
const tooLongForX = rows.filter((r) => r.Accounts === 'X' && xLength(r.Text) > X_LIMIT);
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

const warmupRows = rows.filter((r) => r.Type === 'warmup').length;
const warmupPosts = (warmup || []).length;
console.log(`Старт: ${startDate} (${games.project.timeZone})`);
console.log(`Постов-слотов: ${warmupPosts + 60} (${warmupPosts} прогрев + 30 «сегодня» + 30 «завтра»)`);
console.log(`Строк в CSV: ${rows.length} — по одной на канал (${warmupRows} из них прогрев)`);
console.log(`Записано: ${outPath}`);
const provisionalDays = games.games.filter((g) => g.status === 'planned').length;
if (provisionalDays > 0) {
  console.log(
    `Провизорных дней: ${provisionalDays} — они ещё planned в games.json, ` +
      'порядок может поменяться. Строки помечены меткой provisional.'
  );
}
if (warnings.length) {
  console.log('\nПредупреждения:');
  warnings.forEach((w) => console.log(`  - ${w}`));
}
