#!/usr/bin/env node
// Публикует собранную игру на хаб.
//
//   node release.mjs <slug>          опубликовать
//   node release.mjs <slug> --dry    показать, что произойдёт, ничего не делая
//
// Что делает: собирает app/, кладёт сборку в g/<slug>/, прописывает ссылку и
// дату в games.json и перерисовывает страницы хаба. Источник правды —
// games.json; этот скрипт его дополняет, а не подменяет.
//
// Два URL, намеренно разные:
//   /g/<slug>/   играбельная сборка
//   /<slug>/     страница с описанием и цифрами
//
// Полные ворота качества — это CI (`npm run check`), а не этот скрипт. Здесь
// только быстрая проверка, что код собирается, и отказ публиковать игру,
// которую человек ещё не принял (Gate 4).

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontMatter } from './specs/front-matter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const app = join(root, 'app');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const slug = args.find((a) => !a.startsWith('--'));

if (!slug) {
  console.error('Укажи слаг: node release.mjs <slug> [--dry]');
  process.exit(1);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// --- 1. Игра существует -----------------------------------------------------

const gameDir = join(app, 'games', slug);
if (!existsSync(join(gameDir, 'game.config.ts'))) {
  const built = existsSync(join(app, 'games')) ? readdirSync(join(app, 'games')) : [];
  fail(`нет app/games/${slug}/game.config.ts. Собранные игры: ${built.join(', ') || '—'}`);
}

// --- 2. Запись в games.json -------------------------------------------------

const gamesPath = join(root, 'games.json');
const games = JSON.parse(readFileSync(gamesPath, 'utf8'));
const entry = games.games.find((g) => g.slug === slug);

if (!entry) {
  // Слаг один на всю игру: имя файла спеки, папка в app/games/, ключ в
  // posts.json и адрес на хабе — см. docs/pipeline.md. Молча опубликовать под
  // другим именем значит развести их снова.
  fail(
    `в games.json нет дня со слагом «${slug}».\n` +
      '  Расписание день → слаг живёт в games.json и должно совпадать с именами\n' +
      '  файлов в specs/. Поставь слаг на нужный день или проверь опечатку.',
  );
}

// --- 3. Gate 4: человек принял игру -----------------------------------------

// Зелёный CI говорит, что игра не падает. Он не говорит, понятна ли она и не
// стыдно ли её показывать. Это решает человек, и решение записано файлом —
// иначе однажды вечером в спешке шаг просто пропустится.
const reviewPath = join(gameDir, 'review.md');
if (!existsSync(reviewPath)) {
  fail(
    `нет app/games/${slug}/review.md — игра не прошла ручную проверку.\n` +
      '  Шаблон: docs/templates/review.md. Сыграй сам, потом публикуй.',
  );
}

const review = parseFrontMatter(readFileSync(reviewPath, 'utf8')) ?? {};
if (review['review'] !== 'approved') {
  fail(
    `app/games/${slug}/review.md: review=${String(review['review'] ?? '—')}, нужно approved.\n` +
      '  Gate 4 не пройден — публиковать нечего.',
  );
}

// --- 4. Сборка --------------------------------------------------------------

const run = (cmd, cwd) => execFileSync(cmd, { cwd, shell: true, stdio: 'inherit' });

if (dry) {
  console.log(`[dry] npm run typecheck && npm run build  (в app/)`);
} else {
  run('npm run typecheck', app);
  run('npm run build', app);
}

const distGame = join(app, 'dist', 'games', slug, 'index.html');
if (!dry && !existsSync(distGame)) fail(`сборка не дала ${distGame}`);

// --- 5. Ассеты --------------------------------------------------------------

// Копируются дополнительно и никогда не удаляются. Имена файлов хешированные:
// у уже опубликованной игры HTML ссылается на свой хеш, и он обязан остаться
// рабочим — иначе игра поменяется после публикации, чего §9.1 не допускает.
// Sourcemaps не копируются: 12 из 13 мегабайт сборки — это они.
const distAssets = join(app, 'dist', 'assets');
const siteAssets = join(root, 'g', 'assets');
let copied = 0;

if (!dry) {
  mkdirSync(siteAssets, { recursive: true });
  for (const file of readdirSync(distAssets)) {
    if (file.endsWith('.map')) continue;
    const target = join(siteAssets, file);
    if (existsSync(target)) continue;
    cpSync(join(distAssets, file), target);
    copied += 1;
  }
}

// --- 6. Страница игры -------------------------------------------------------

// В сборке игра лежит на два уровня ниже ассетов (games/<slug>/), на хабе —
// на один (g/<slug>/). Глубина меняется, значит меняется и путь.
const siteGame = join(root, 'g', slug);
if (!dry) {
  mkdirSync(siteGame, { recursive: true });
  const html = readFileSync(distGame, 'utf8').replaceAll('../../assets/', '../assets/');
  writeFileSync(join(siteGame, 'index.html'), html);
}

// Медиа игры живут в её папке и едут на сайт вместе со сборкой. Ролик
// намеренно не копируется и не коммитится: тридцать видео превратили бы
// репозиторий, который хостится как есть, в сотни мегабайт. Его загружает
// планировщик с диска, сайту он не нужен.
const gameMedia = join(gameDir, 'media');
let mediaCopied = 0;
if (!dry && existsSync(gameMedia)) {
  const target = join(siteGame, 'media');
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(gameMedia)) {
    if (file.endsWith('.mp4') || file.endsWith('.mov') || file.endsWith('.md')) continue;
    cpSync(join(gameMedia, file), join(target, file));
    mediaCopied += 1;
  }
}

// --- 7. games.json ----------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const playUrl = `/g/${slug}/`;
const before = JSON.stringify({ status: entry.status, play: entry.links.play, date: entry.date });

entry.links.play = playUrl;
entry.status = 'published';
entry.date ??= today;

if (!dry) {
  writeFileSync(gamesPath, `${JSON.stringify(games, null, 2)}\n`);
  run('node build-games.mjs', root);
}

// --- Отчёт ------------------------------------------------------------------

console.log(`\n${dry ? '[dry] ' : ''}день ${String(entry.day)} · ${slug}`);
console.log(`  играбельная сборка : g/${slug}/index.html`);
console.log(`  общие ассеты       : +${String(copied)} новых файлов в g/assets/`);
console.log(`  медиа игры         : ${String(mediaCopied)} файлов в g/${slug}/media/ (ролик не копируется)`);
console.log(`  страница-описание  : ${slug}/index.html (перерисована build-games.mjs)`);
console.log(`  games.json         : ${before} → status=published, play=${playUrl}`);
console.log(dry ? '\nНичего не записано.' : '\nОстаётся закоммитить и запушить.');
