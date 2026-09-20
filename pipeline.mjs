#!/usr/bin/env node
// Доска конвейера: что в каком статусе и что ждёт решения человека.
//
//   node pipeline.mjs            вся доска
//   node pipeline.mjs --waiting  только то, что ждёт тебя
//   node pipeline.mjs --json     то же машиночитаемо
//
// Стадия нигде не хранится — она считается из файлов. Нет поля `status`,
// которое надо не забыть поменять: артефакт либо есть, либо нет. Поэтому
// доска не может устареть, в отличие от таблицы со статусами.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecs, parseFrontMatter } from './specs/front-matter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const onlyWaiting = args.includes('--waiting');
const asJson = args.includes('--json');

const tty = process.stdout.isTTY && !asJson;
const bold = (s) => (tty ? `\u001b[1m${s}\u001b[0m` : s);
const dim = (s) => (tty ? `\u001b[2m${s}\u001b[0m` : s);
const warn = (s) => (tty ? `\u001b[33m${s}\u001b[0m` : s);

const MONTH_DAYS = 30; // окно измерения одного прототипа
const MIN_COMPLETIONS = 30;

const today = new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readMeta(path) {
  if (!existsSync(path)) return null;
  return parseFrontMatter(readFileSync(path, 'utf8'));
}

// --- Сбор -------------------------------------------------------------------

const games = readJson(join(root, 'games.json'));
const specs = loadSpecs(join(root, 'specs'));

const ideas = new Map();
for (const folder of ['active', 'rejected']) {
  const dir = join(root, 'ideas', folder);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f))) {
    const meta = parseFrontMatter(readFileSync(join(dir, file), 'utf8')) ?? {};
    ideas.set(file.replace(/^\d+-/, '').replace(/\.md$/, ''), { folder, file, meta });
  }
}

const dayBySlug = new Map(games.games.filter((g) => g.slug).map((g) => [g.slug, g]));

/**
 * Стадия и то, что её держит. Порядок проверок — обратный ходу конвейера:
 * самый поздний существующий артефакт и есть текущая стадия.
 */
function statusOf(slug) {
  const spec = specs.get(slug);
  const idea = ideas.get(slug);
  const game = dayBySlug.get(slug);
  const number = spec?.meta['number'] ?? idea?.meta['number'] ?? null;

  const gameDir = join(root, 'app', 'games', slug);
  const built = existsSync(join(gameDir, 'game.config.ts'));
  const review = readMeta(join(gameDir, 'review.md'));
  const published = Boolean(game?.links?.play);
  const data = existsSync(join(root, 'data', `${slug}.json`))
    ? readJson(join(root, 'data', `${slug}.json`))
    : null;
  const resultFile = number === null ? null : `${String(number).padStart(2, '0')}-${slug}.md`;
  const result = resultFile ? readMeta(join(root, 'results', resultFile)) : null;

  const out = { slug, number, day: game?.day ?? null, stage: '—', waiting: null, note: '' };

  if (result?.['verdict']) {
    out.stage = 'вердикт';
    out.note = String(result['verdict']);
    return out;
  }

  if (data) {
    out.stage = 'цифры';
    const rate = data.opened > 0 ? Math.round((data.completed / data.opened) * 100) : 0;
    out.note = `${data.completed}/${data.opened} (${rate}%)`;
    out.waiting =
      data.completed >= MIN_COMPLETIONS
        ? 'вердикт'
        : `вердикт — прохождений ${data.completed} из ${MIN_COMPLETIONS}`;
    return out;
  }

  if (published) {
    out.stage = 'опубликована';
    if (game.date) {
      const passed = daysBetween(game.date, today);
      out.note = passed >= MONTH_DAYS ? 'месяц вышел' : `идёт ${passed}/${MONTH_DAYS} дн.`;
      if (passed >= MONTH_DAYS) out.waiting = 'снять цифры';
    }
    return out;
  }

  if (built) {
    const verdict = review?.['review'];
    if (verdict === 'approved') {
      out.stage = 'принята';
      out.waiting = 'релиз';
    } else if (verdict === 'rework') {
      out.stage = 'сборка';
      out.note = 'на доработке';
    } else {
      out.stage = 'собрана';
      out.waiting = review === null ? 'gate 4 — сыграть' : 'gate 4 — решение';
    }
    return out;
  }

  if (spec) {
    const verdict = spec.meta['review'];
    out.stage = 'спека';
    if (verdict === 'approved') out.waiting = 'сборку';
    else if (verdict === 'rework') out.note = 'на доработке';
    else if (verdict === 'pending') out.waiting = 'gate 2 — принять спеку';
    // У спек 1–35 поля нет: они писались до появления этапа. Ждать с них
    // gate 2 нечего, и писать об этом тридцать раз — превратить доску в шум.
    else if (idea) out.note = dim('без gate 2');
    return out;
  }

  if (idea) {
    const gate = idea.meta['gate1'] ?? 'pending';
    const score = idea.meta['score'];
    const total =
      score && typeof score === 'object'
        ? Object.values(score).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
        : null;

    if (gate === 'rejected') {
      out.stage = 'отклонена';
      out.note = total ? `${total}/30` : '';
    } else if (gate === 'approved') {
      out.stage = 'идея';
      out.note = total ? `${total}/30` : '';
      out.waiting = 'спеку';
    } else {
      out.stage = 'идея';
      out.note = total ? `${total}/30` : dim('не оценена');
      out.waiting = total === null ? 'оценку' : 'gate 1 — твоё решение';
    }
    return out;
  }

  return out;
}

// Все известные слаги: из расписания, из спек, из идей.
const slugs = [...new Set([...dayBySlug.keys(), ...specs.keys(), ...ideas.keys()])];
const rows = slugs.map(statusOf);

const scheduled = rows.filter((r) => r.day !== null).sort((a, b) => a.day - b.day);
const backlog = rows
  .filter((r) => r.day === null)
  .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

// --- Вывод ------------------------------------------------------------------

if (asJson) {
  console.log(JSON.stringify({ today, rows }, null, 2));
  process.exit(0);
}

const waiting = rows.filter((r) => r.waiting);

if (!onlyWaiting) {
  const start = games.project.startDate;
  const toStart = daysBetween(today, start);
  const when =
    toStart > 0 ? `старт ${start}, через ${toStart} дн.` : `день ${String(-toStart + 1)} из 30`;
  console.log(`\n${bold('PLAY')} · ${today} · ${when}\n`);

  const width = Math.max(...rows.map((r) => r.slug.length), 8);
  const line = (r, left) =>
    `  ${left.padStart(3)}  ${r.slug.padEnd(width)}  ${r.stage.padEnd(13)}  ${r.note}`;

  console.log(dim(`  ${'день'.padStart(3)}  ${'слаг'.padEnd(width)}  стадия`));
  for (const r of scheduled) console.log(line(r, String(r.day)));

  if (backlog.length > 0) {
    console.log(dim('\n  вне расписания'));
    for (const r of backlog) console.log(line(r, r.number === null ? '—' : `#${r.number}`));
  }
}

if (waiting.length === 0) {
  console.log(`\n${bold('Ничего не ждёт решения.')}\n`);
} else {
  console.log(`\n${bold(`Ждёт тебя: ${waiting.length}`)}`);
  for (const r of waiting) {
    const label = r.day === null ? `#${r.number ?? '—'}` : `день ${r.day}`;
    console.log(`  ${warn('•')} ${r.slug} (${label}) — ${r.waiting}`);
  }
  console.log('');
}

if (!onlyWaiting) {
  const count = (fn) => rows.filter(fn).length;
  console.log(
    dim(
      `  идей ${count((r) => ideas.has(r.slug))} · ` +
        `спек ${count((r) => specs.has(r.slug))} · ` +
        `собрано ${count((r) => ['собрана', 'принята', 'опубликована', 'цифры', 'вердикт'].includes(r.stage))} · ` +
        `опубликовано ${count((r) => ['опубликована', 'цифры', 'вердикт'].includes(r.stage))} · ` +
        `с вердиктом ${count((r) => r.stage === 'вердикт')}\n`,
    ),
  );
}
