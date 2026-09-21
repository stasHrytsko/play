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
const FULL_PACK = 5;   // уровней в готовой игре, см. app/src/game-definition.ts
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

// Лаборатория: собранная игра до релиза, по ссылке, которая открывается с
// телефона. Адрес живёт в games.json рядом с остальными ссылками проекта.
// Пусто — значит проекта ещё нет, и доска зовёт поднимать dev-сервер, а не
// показывает ссылку, которой не существует.
const labUrl = String(games.project?.labUrl ?? '').replace(/\/$/, '');
const labLink = (slug) => (labUrl === '' ? null : `${labUrl}/games/${slug}/`);
const playIt = (slug) =>
  labUrl === ''
    ? {
        run: 'cd app && npm run dev -- --host   # открой с телефона',
        note: 'ссылки нет: project.labUrl в games.json пустой, см. docs/PLAY.md → Лаборатория',
      }
    : { open: labLink(slug) };

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
  // Срез от готовой игры отличается числом уровней в паке — отдельного поля
  // «это срез» нет намеренно: оно бы разошлось с содержимым levels.json, а
  // стадия обязана считаться из файлов, а не из пометки о файлах.
  const levelsPath = join(gameDir, 'mechanic', 'levels', 'levels.json');
  const levelCount = existsSync(levelsPath)
    ? (readJson(levelsPath).levels ?? []).length
    : 0;
  const fullPack = levelCount >= FULL_PACK;
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

  if (result?.['gate2']) {
    // Gate 2 — прототип на живых игроках, ideas/gate2.md. Концепт, закрытый
    // раньше, на проверке среза, пишется сюда же с players: 0: иначе в итогах
    // тридцатки будет молчаливая дыра вместо истории.
    const gate2 = String(result['gate2']);
    out.stage = gate2 === 'kill' ? 'убита' : 'вердикт';
    out.note = gate2 === 'rework' ? 'gate 2: доработать' : gate2;
    return out;
  }

  if (data) {
    out.stage = 'цифры';
    const rate = data.opened > 0 ? Math.round((data.completed / data.opened) * 100) : 0;
    out.note = `${data.completed}/${data.opened} (${rate}%)`;
    const enough = data.completed >= MIN_COMPLETIONS;
    wait(enough ? 'gate 2 — прототип на игроках' : `gate 2 — прохождений ${data.completed} из ${MIN_COMPLETIONS}`, {
      actor: 'AI считает, решаешь ты',
      open: dataPath,
      read: `условия в ideas/gate2.md; kill-критерий в шапке ${ideaPath ?? String(specPath)}`,
      write: enough
        ? `${resultPath ?? 'results/NN-slug.md'} — gate2: ready_for_production | rework | kill, доли и наблюдения`
        : `${resultPath ?? 'results/NN-slug.md'} — выборки мало; «понимают цель» из воронки не берётся, нужны живые игроки`,
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
    // Одно поле, одни ворота: человек играет срез и отвечает
    // approved | rework | rejected. Публикация отдельной подписи не требует —
    // запуск release.mjs и есть решение публиковать.
    const verdict = review?.['review'];

    if (verdict === 'rejected') {
      out.stage = 'убита';
      out.note = 'сыграл — не то';
      wait('закрыть концепт', {
        actor: 'AI предлагает, решаешь ты',
        open: reviewPath,
        read: 'журнал приёмки — почему именно не то',
        write: `${resultPath ?? 'results/NN-slug.md'} — gate2: kill, players: 0 и строка почему: до игроков не дошло`,
      });
      return out;
    }

    if (verdict === 'rework') {
      out.stage = fullPack ? 'сборка' : 'срез';
      out.note = 'на доработке';
      out.action = {
        actor: 'AI',
        open: reviewPath,
        read: 'замечания последнего захода',
        write: `правки в app/games/${slug}/`,
      };
      return out;
    }

    // Срез собран, но человек его ещё не щупал: самая дешёвая точка выхода в
    // конвейере — дальше уже подбираются пять раскладок.
    if (verdict !== 'approved') {
      out.stage = fullPack ? 'собрана' : 'срез';
      out.note = `${levelCount} из ${FULL_PACK} уровней`;
      wait('сыграть срез', {
        // Проверка «три минуты», которую нельзя сделать с телефона,
        // откладывается — а отложенные ворота это ворота, которых нет.
        // Поэтому первым делом ссылка, и только если её нет — dev-сервер.
        ...playIt(slug),
        read: ideaPath
          ? `раздел 6 в ${ideaPath} — лучший игровой момент; §7.1 спеки — как должен выглядеть экран`
          : 'спеку, раздел 7.1 — как должен выглядеть экран',
        write: `${reviewPath} — review: approved | rework | rejected, reviewed: дата. Три минуты и три ответа: идём / доработать / убить`,
      });
      return out;
    }

    // Срез принят — уровни дописывает AI, человека это не ждёт.
    if (!fullPack) {
      out.stage = 'срез';
      out.note = `${levelCount} из ${FULL_PACK} уровней`;
      out.action = {
        actor: 'AI',
        open: specPath,
        read: 'раздел 6 спеки — кривая сложности и названная разница между уровнями',
        write: `app/games/${slug}/mechanic/levels/levels.json — до ${FULL_PACK} уровней, тесты кривой и kill-критерия`,
      };
      return out;
    }

    out.stage = 'принята';
    wait('релиз', {
      actor: 'ты запускаешь',
      run: `node release.mjs ${slug}`,
      read: 'сыграй пять уровней перед запуском — отдельной подписи под это нет, запуск и есть решение',
      write: 'скрипт сам проставит links.play и дату в games.json',
    });
    return out;
  }

  if (spec) {
    // Состояние документа, не ворота концепта: draft | review | approved
    // (specs/_TEMPLATE.md). Ворот двое, и оба в ideas/.
    const status = spec.meta['spec_status'];
    out.stage = 'спека';

    // Спека написана, а идея вернулась на Gate 1 — так бывает, когда меняется
    // планка (2026-09-21, `prototypeability ≥ 4`). Ждёт при этом Gate 1, а не
    // принимать спеку у концепта, который ещё не решён на Gate 1, значит
    // принимать решение задом наперёд.
    if (idea && (idea.meta['gate1'] ?? 'pending') !== 'approved') {
      out.note = `идея на gate 1: ${String(idea.meta['gate1'] ?? 'pending')}`;
      wait('gate 1 — твоё решение', {
        open: ideaPath,
        read: 'раздел «Оценка» и порог в ideas/README.md — спека уже написана, но идея не одобрена',
        write: 'в шапке идеи: gate1: approved | rejected и gate1_date. При rejected — файл в ideas/rejected/ с одной строкой почему',
      });
      return out;
    }
    if (status === 'approved') {
      wait('сборку среза', {
        actor: 'AI',
        open: specPath,
        read: 'спеку целиком, включая §7.1 — макет экрана',
        write: `app/games/${slug}/ — движок, рендер, тесты и ОДИН уровень`,
      });
    } else if (status === 'draft') {
      out.note = 'черновик';
      out.action = {
        actor: 'AI', open: specPath, read: 'раздел «Замечания» внизу файла', write: specPath,
      };
    } else if (status === 'review') {
      wait('принять спеку', {
        open: specPath,
        read: 'спеку целиком — из каждого пункта должен писаться тест; и §7.1 — приложен ли макет экрана',
        write: 'в шапке: spec_status: approved | draft и spec_reviewed: дата; при draft — раздел «Замечания» внизу файла',
      });
    } else {
      // Поля нет: спека написана до появления spec_status. Раньше здесь не
      // происходило ничего — ни ожидания, ни пометки, — и доска молчала о
      // тридцати спеках, которые ворот не проходили. Молчание хуже шума:
      // по пустой клетке не отличить «пройдено» от «не дошли руки».
      out.note = 'нет spec_status';
      out.action = {
        actor: 'человек',
        open: specPath,
        read: 'спеку целиком — из каждого пункта должен писаться тест',
        write: 'в шапке: spec_status: approved | review | draft и spec_reviewed: дата',
      };
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

// День без слага — дыра в расписании: концепт убит или ещё не выбран. Без
// этой строки день просто исчезает с доски, потому что строки строятся по
// слагам. Исчезнувший день — худший вид пустой клетки: его не видно даже как
// вопрос.
for (const game of games.games.filter((g) => !g.slug)) {
  rows.push({
    slug: '—',
    number: null,
    day: game.day,
    stage: 'день пуст',
    note: 'концепт не назначен',
    releasedAt: null,
    waiting: 'выбрать концепт на день',
    action: {
      actor: 'человек',
      open: 'games.json',
      read: 'полку концептов: `node pipeline.mjs`, стадия «спека» — что уже написано и принято',
      write: `games.json → день ${String(game.day)}: slug концепта, который выходит в этот день`,
    },
  });
}

// Приёмка нужна каждой из тридцати спек, но не сегодня: игры делаются по
// одной. Поэтому в список ожидающих попадает только ближайшая по расписанию
// — остальные видны в таблице пометкой «ждёт приёмки» и ждут своей очереди.
// Показывать тридцать одинаковых пунктов значит утопить в них остальные.
const queue = rows
  .filter((r) => r.day !== null && r.stage === 'спека' && r.waiting === 'принять спеку')
  .sort((a, b) => a.day - b.day);

for (const [i, r] of queue.entries()) {
  if (i === 0) {
    r.action = {
      ...r.action,
      read: `${r.action.read}. Следующая по расписанию из ${queue.length} на приёмке`,
    };
    continue;
  }
  // Ждёт очереди: в таблице видна, в список не попадает.
  r.waiting = null;
  r.note = r.note || 'ждёт приёмки';
}

const scheduled = rows.filter((r) => r.day !== null).sort((a, b) => a.day - b.day);
const backlog = rows
  .filter((r) => r.day === null)
  .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

// --- Вывод ------------------------------------------------------------------

// Воронка: сколько концептов дошли **хотя бы** до каждой вехи. Не доля от
// целого, а накопленный счёт — иначе ранние стадии выглядели бы победой.
const RANK = {
  'идея': 0, 'спека': 1, 'срез': 2, 'сборка': 2, 'собрана': 3, 'принята': 3,
  'опубликована': 4, 'цифры': 4, 'вердикт': 5,
  // «Убита» — не стадия пути, а его конец: концепт дошёл до сборки и дальше
  // не поедет. В воронке он честно стоит там, где остановился.
  'убита': 3,
};
const MILESTONES = ['идея', 'спека', 'срез', 'собрана', 'опубликована', 'вердикт'];
const ranked = rows.filter((r) => RANK[r.stage] !== undefined);
const funnel = MILESTONES.map((stage, i) => ({
  stage,
  count: ranked.filter((r) => RANK[r.stage] >= i).length,
}));

// Общей даты старта здесь нет намеренно: окно каждого прототипа отсчитывается
// от его собственной публикации, и доска эту дату не показывает.
// `project.startDate` остался в games.json — он нужен расписанию постов.
const payload = {
  generatedAt: new Date().toISOString(),
  today,
  counts: {
    ideas: rows.filter((r) => ideas.has(r.slug)).length,
    rejected: rows.filter((r) => r.stage === 'отклонена').length,
    specs: rows.filter((r) => specs.has(r.slug)).length,
    built: ranked.filter((r) => RANK[r.stage] >= 3).length,
    published: ranked.filter((r) => RANK[r.stage] >= 4).length,
    judged: rows.filter((r) => r.stage === 'вердикт').length,
  },
  trends,
  // Страница переживает свой деплой: она может висеть на экране неделями, а
  // «месяц вышел» наступает без единого коммита. Поэтому правила едут с
  // данными, и всё, что зависит от даты, страница досчитывает сама.
  // stageRank едет вместе с данными, а не лежит копией в index.html: стадия
  // добавляется в pipeline.mjs, и страница должна узнавать о ней оттуда же.
  rules: { monthDays: MONTH_DAYS, minCompletions: MIN_COMPLETIONS, stageRank: RANK },
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
    if (a.note) console.log(`      ${dim('учти')}       ${a.note}`);
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
        `срезов ${count((r) => r.stage === 'срез')} · ` +
        `собрано ${count((r) => ['собрана', 'принята', 'опубликована', 'цифры', 'вердикт'].includes(r.stage))} · ` +
        `опубликовано ${count((r) => ['опубликована', 'цифры', 'вердикт'].includes(r.stage))} · ` +
        `с вердиктом ${count((r) => r.stage === 'вердикт')}\n`,
    ),
  );
}
