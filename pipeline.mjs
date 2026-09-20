#!/usr/bin/env node
// Доска конвейера: что в каком статусе и что ждёт решения человека.
//
//   node pipeline.mjs            вся доска
//   node pipeline.mjs --waiting  только то, что ждёт тебя
//   node pipeline.mjs --json     то же машиночитаемо
//   node pipeline.mjs --write    записать dashboard/status.json для страницы
//   node pipeline.mjs --check    упасть, если записанное отстало от репозитория
//
// status.json коммитится. Страница тогда работает на чистой статике, при любой
// настройке хостинга, а забыть его обновить не даёт --check в CI — он гоняется
// на каждом пуше и ничего не требует включать руками.
//
// Стадия нигде не хранится — она считается из файлов. Нет поля `status`,
// которое надо не забыть поменять: артефакт либо есть, либо нет. Поэтому
// доска не может устареть, в отличие от таблицы со статусами.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecs, parseFrontMatter } from './specs/front-matter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const onlyWaiting = args.includes('--waiting');
const asJson = args.includes('--json');
const write = args.includes('--write');
const check = args.includes('--check');

const tty = process.stdout.isTTY && !asJson && !write && !check;
const bold = (s) => (tty ? `\u001b[1m${s}\u001b[0m` : s);
const dim = (s) => (tty ? `\u001b[2m${s}\u001b[0m` : s);
const warn = (s) => (tty ? `\u001b[33m${s}\u001b[0m` : s);
// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const MONTH_DAYS = 30; // окно измерения одного прототипа
const MIN_COMPLETIONS = 30;
const MIN_TOTAL = 24;  // порог Gate 1, см. ideas/validate.mjs

const today = new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Адрес репозитория на GitHub — чтобы «ждёт тебя» вёл в файл, а не называл
 * путь. Берётся из remote, а не вписывается: переедет репозиторий — переедут
 * и ссылки. Нет git — просто не будет ссылок, доска от этого не ломается.
 */
function repoUrl() {
  try {
    const raw = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const m = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/.exec(raw);
    return m ? `https://github.com/${m[1]}/${m[2]}/blob/main` : null;
  } catch {
    return null;
  }
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

// Наблюдения по рынку — не стадия конвейера, но это то, что в проекте
// меняется чаще всего. Доска обязана показывать и их, иначе неделя работы с
// трендами выглядит на ней как неделя простоя.
const trendsDir = join(root, 'trends');
const trendFiles = existsSync(trendsDir)
  ? readdirSync(trendsDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f)).sort()
  : [];
const trends = {
  count: trendFiles.length,
  latest: trendFiles.length > 0 ? trendFiles[trendFiles.length - 1].slice(0, 10) : null,
};

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

  const out = {
    slug, number, day: game?.day ?? null, stage: '—', waiting: null, note: '',
    releasedAt: published ? (game.date ?? null) : null,
    // Что открыть, что прочитать, куда записать решение. Без этого «ждёт
    // решения» — не задача, а напоминание: непонятно, с чего начать.
    action: null,
  };

  const ideaPath = idea ? `ideas/${idea.folder}/${idea.file}` : null;
  const specPath = spec ? `specs/${spec.file}` : null;
  const reviewPath = `app/games/${slug}/review.md`;
  const dataPath = `data/${slug}.json`;
  const resultPath = resultFile ? `results/${resultFile}` : null;

  /** Ставит и короткую подпись для таблицы, и развёрнутое действие. */
  const wait = (label, action) => {
    out.waiting = label;
    out.action = { actor: 'человек', ...action };
  };

  if (result?.['verdict']) {
    out.stage = 'вердикт';
    out.note = String(result['verdict']);
    return out;
  }

  if (data) {
    out.stage = 'цифры';
    const rate = data.opened > 0 ? Math.round((data.completed / data.opened) * 100) : 0;
    out.note = `${data.completed}/${data.opened} (${rate}%)`;
    const enough = data.completed >= MIN_COMPLETIONS;
    wait(enough ? 'вердикт' : `вердикт — прохождений ${data.completed} из ${MIN_COMPLETIONS}`, {
      actor: 'AI предлагает, решаешь ты',
      open: dataPath,
      read: ideaPath
        ? `цифры и kill-критерий в шапке ${ideaPath}`
        : `цифры и kill-критерий в шапке ${String(specPath)}`,
      write: enough
        ? `${resultPath ?? 'results/NN-slug.md'} — карточка и verdict: PROMOTE | KILL | INCONCLUSIVE`
        : `${resultPath ?? 'results/NN-slug.md'} — verdict: INCONCLUSIVE, выборка мала для вывода`,
    });
    return out;
  }

  if (published) {
    out.stage = 'опубликована';
    if (game.date) {
      const passed = daysBetween(game.date, today);
      out.note = passed >= MONTH_DAYS ? 'месяц вышел' : `идёт ${passed}/${MONTH_DAYS} дн.`;
      if (passed >= MONTH_DAYS) {
        wait('снять цифры', {
          actor: 'скрипт',
          read: `месяц с ${game.date} вышел`,
          write: dataPath,
        });
      }
    }
    return out;
  }

  if (built) {
    const verdict = review?.['review'];
    if (verdict === 'approved') {
      out.stage = 'принята';
      wait('релиз', {
        actor: 'ты запускаешь',
        run: `node release.mjs ${slug}`,
        read: `${reviewPath} — подписано`,
        write: 'скрипт сам проставит links.play и дату в games.json',
      });
    } else if (verdict === 'rework') {
      out.stage = 'сборка';
      out.note = 'на доработке';
      out.action = {
        actor: 'AI',
        open: reviewPath,
        read: 'замечания последнего захода',
        write: `правки в app/games/${slug}/`,
      };
    } else {
      wait(review === null ? 'gate 4 — сыграть' : 'gate 4 — решение', {
        open: review === null ? null : reviewPath,
        run: 'cd app && npm run dev',
        read: ideaPath ? `раздел 4 в ${ideaPath} — ради какого момента играют` : 'спеку',
        write: `${reviewPath} — review: approved | rework, reviewed: дата, ниже журнал`,
      });
      out.stage = 'собрана';
    }
    return out;
  }

  if (spec) {
    const verdict = spec.meta['review'];
    out.stage = 'спека';
    if (verdict === 'approved') {
      wait('сборку', {
        actor: 'AI',
        open: specPath,
        read: 'спеку целиком',
        write: `app/games/${slug}/`,
      });
    } else if (verdict === 'rework') {
      out.note = 'на доработке';
      out.action = {
        actor: 'AI', open: specPath, read: 'раздел «Замечания» внизу файла', write: specPath,
      };
    } else if (verdict === 'pending') {
      wait('gate 2 — принять спеку', {
        open: specPath,
        read: 'спеку целиком — из каждого пункта должен писаться тест',
        write: 'в шапке: review: approved | rework и reviewed: дата; при rework — раздел «Замечания» внизу файла',
      });
    }
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
      wait('спеку', {
        actor: 'AI',
        open: ideaPath,
        read: 'идею целиком',
        write: `specs/${String(number).padStart(2, '0')}-${slug}.md по specs/_TEMPLATE.md`,
      });
    } else {
      out.stage = 'идея';
      out.note = total ? `${total}/30` : dim('не оценена');
      if (total === null) {
        wait('оценку', {
          actor: 'AI',
          open: ideaPath,
          read: 'разделы 1–8',
          write: `${ideaPath} — раздел «Оценка»: шесть критериев по 1–5, саммари, итог`,
        });
      } else {
        wait('gate 1 — твоё решение', {
          open: ideaPath,
          read: `идею целиком и раздел «Оценка» в конце (${total}/30, порог ${MIN_TOTAL})`,
          write: 'в шапке: gate1: approved | rejected и gate1_date: дата. При rejected — файл переезжает в ideas/rejected/ с одной строкой почему',
        });
      }
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

// Воронка: сколько концептов дошли **хотя бы** до каждой вехи. Не доля от
// целого, а накопленный счёт — иначе ранние стадии выглядели бы победой.
const RANK = {
  'идея': 0, 'спека': 1, 'собрана': 2, 'принята': 2,
  'опубликована': 3, 'цифры': 3, 'вердикт': 4,
};
const MILESTONES = ['идея', 'спека', 'собрана', 'опубликована', 'вердикт'];
const ranked = rows.filter((r) => RANK[r.stage] !== undefined);
const funnel = MILESTONES.map((stage, i) => ({
  stage,
  count: ranked.filter((r) => RANK[r.stage] >= i).length,
}));

const start = games.project.startDate;
const toStart = daysBetween(today, start);

const payload = {
  generatedAt: new Date().toISOString(),
  today,
  startDate: start,
  daysToStart: toStart > 0 ? toStart : null,
  dayOfExperiment: toStart <= 0 ? Math.min(30, -toStart + 1) : null,
  counts: {
    ideas: rows.filter((r) => ideas.has(r.slug)).length,
    rejected: rows.filter((r) => r.stage === 'отклонена').length,
    specs: rows.filter((r) => specs.has(r.slug)).length,
    built: ranked.filter((r) => RANK[r.stage] >= 2).length,
    published: ranked.filter((r) => RANK[r.stage] >= 3).length,
    judged: rows.filter((r) => r.stage === 'вердикт').length,
  },
  trends,
  // Страница переживает свой деплой: она может висеть на экране неделями, а
  // «месяц вышел» наступает без единого коммита. Поэтому правила едут с
  // данными, и всё, что зависит от даты, страница досчитывает сама.
  rules: { monthDays: MONTH_DAYS, minCompletions: MIN_COMPLETIONS },
  funnel,
  repoUrl: repoUrl(),
  waiting: rows.filter((r) => r.waiting).map((r) => ({
    slug: r.slug, number: r.number, day: r.day, stage: r.stage,
    waiting: r.waiting, action: r.action,
  })),
  rows: rows.map((r) => ({ ...r, note: stripAnsi(r.note) })),
};

// Сравнивается только то, что зависит от файлов. Дата в снимке меняется сама,
// а всё, что от неё зависит, страница и так пересчитывает в браузере.
const FIXED = ({ counts, trends, funnel, rows }) => JSON.stringify({ counts, trends, funnel, rows });

if (check) {
  const out = join(root, 'dashboard', 'status.json');
  if (!existsSync(out)) {
    console.error('Нет dashboard/status.json. Запусти: node pipeline.mjs --write');
    process.exit(1);
  }
  if (FIXED(readJson(out)) !== FIXED(payload)) {
    console.error(
      'dashboard/status.json отстал от репозитория.\n' +
        "  Доска показывала бы не то, что есть. Запусти 'node pipeline.mjs --write' и закоммить.",
    );
    process.exit(1);
  }
  console.log('dashboard/status.json совпадает с состоянием репозитория');
  process.exit(0);
}

if (write) {
  const out = join(root, 'dashboard', 'status.json');
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Записано: dashboard/status.json (ждёт решения: ${payload.waiting.length})`);
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const waiting = rows.filter((r) => r.waiting);

if (!onlyWaiting) {
  // Без общей даты старта: часы каждого прототипа идут от его собственной
  // публикации, и окно в тридцать дней считается от неё.
  console.log(`\n${bold('PLAY')} · конвейер\n`);

  const width = Math.max(...rows.map((r) => r.slug.length), 8);
  const line = (r, left) =>
    `  ${left.padStart(3)}  ${r.slug.padEnd(width)}  ${r.stage.padEnd(13)}  ` +
    `${(r.releasedAt ?? '—').padEnd(11)}${r.note}`;

  console.log(dim(
    `  ${'№'.padStart(3)}  ${'слаг'.padEnd(width)}  ${'стадия'.padEnd(13)}  ${'вышла'.padEnd(11)}состояние`,
  ));
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
    const a = r.action ?? {};
    const who = a.actor && a.actor !== 'человек' ? dim(` [${a.actor}]`) : '';
    console.log(`  ${warn('•')} ${bold(r.slug)} (${label}) — ${r.waiting}${who}`);
    if (a.open) console.log(`      ${a.open}`);
    if (a.run) console.log(`      ${dim('запустить')}  ${a.run}`);
    if (a.read) console.log(`      ${dim('прочитать')}  ${a.read}`);
    if (a.write) console.log(`      ${dim('записать')}   ${a.write}`);
  }
  console.log('');
}

if (!onlyWaiting) {
  const count = (fn) => rows.filter(fn).length;
  const daysSinceTrend = trends.latest ? daysBetween(trends.latest, today) : null;
  console.log(
    dim(
      `  наблюдений ${trends.count}` +
        (daysSinceTrend === null ? '' : ` (последнее ${daysSinceTrend} дн. назад)`) + ' · ' +
        `идей ${count((r) => ideas.has(r.slug))} · ` +
        `спек ${count((r) => specs.has(r.slug))} · ` +
        `собрано ${count((r) => ['собрана', 'принята', 'опубликована', 'цифры', 'вердикт'].includes(r.stage))} · ` +
        `опубликовано ${count((r) => ['опубликована', 'цифры', 'вердикт'].includes(r.stage))} · ` +
        `с вердиктом ${count((r) => r.stage === 'вердикт')}\n`,
    ),
  );
}
