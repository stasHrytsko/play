#!/usr/bin/env node
// Проверяет спеки против specs/_TEMPLATE.md.
//
//   node specs/validate.mjs
//
// Падает только на ошибках — том, что делает спеку непригодной для сборки.
// Недозаполненное сообщается предупреждением и сборку не роняет: пробел
// должен быть виден, но не блокировать работу над другими играми.

import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { loadSpecs, parseFrontMatter } from './front-matter.mjs';

// Поля шапки, без которых спеку нельзя ни собрать, ни судить.
// Паспорт — идентификаторы, гипотеза, kill-критерий и состояние документа;
// оценка идеи остаётся в файле идеи и сюда не переезжает (specs/_TEMPLATE.md).
const REQUIRED = [
  'slug', 'number', 'title_ru', 'title_en', 'pitch_ru', 'pitch_en',
  'levels', 'solver', 'kill_criterion',
];
const ENUMS = {
  levels: ['generated', 'authored'],
  solver: ['required', 'none'],
  spec_status: ['draft', 'review', 'approved'],
};
// Наследуется из шапки идеи без изменений. pitch_*, hypothesis и spec_status
// появляются здесь: формулировки рождаются, когда игра уже описана.
const INHERITED = ['number', 'title_ru', 'title_en', 'family', 'levels', 'solver',
  'kill_criterion'];
// События, которых шелл не шлёт: см. src/shell/signal/SignalSink.ts.
const RETIRED = ['more_yes', 'session_2', 'return_d1', 'return_d7'];
const SECTIONS = 8; // §1..§8 заголовками; §0 — шапка, приложение A не нумеруется

const errors = [];
const warnings = [];
const withoutHypothesis = [];

const specs = loadSpecs();

/** Идеи из обеих папок: слаг → { folder, file, meta }. */
const ideas = new Map();
for (const folder of ['active', 'rejected']) {
  const dir = new URL(`../ideas/${folder}/`, import.meta.url);
  let entries = [];
  try {
    entries = readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f));
  } catch {
    continue; // папки может не быть — это не дело валидатора спек
  }
  for (const file of entries) {
    const meta = parseFrontMatter(readFileSync(new URL(file, dir), 'utf8'));
    if (meta) ideas.set(file.replace(/^\d+-/, '').replace(/\.md$/, ''), { folder, file, meta });
  }
}

for (const [slugFromName, { file, text, meta }] of specs) {
  const where = `specs/${file}`;

  if (Object.keys(meta).length === 0) {
    errors.push(`${where}: нет YAML-шапки (раздел 0 шаблона)`);
    continue;
  }

  for (const key of REQUIRED) {
    const value = meta[key];
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) errors.push(`${where}: в шапке нет ${key}`);
  }

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (meta[key] !== undefined && !allowed.includes(meta[key])) {
      errors.push(`${where}: ${key}=${String(meta[key])}, допустимо ${allowed.join(' | ')}`);
    }
  }

  if (meta['slug'] !== slugFromName) {
    errors.push(`${where}: slug «${String(meta['slug'])}» не совпадает с именем файла`);
  }

  const retired = RETIRED.filter((event) => text.includes(event));
  if (retired.length > 0) {
    errors.push(`${where}: требует событий, которых шелл не шлёт: ${retired.join(', ')}`);
  }

  const pressure = Array.isArray(meta['pressure']) ? meta['pressure'] : [];
  if (pressure.length > 2) errors.push(`${where}: давлений ${pressure.length}, максимум два`);

  const found = (text.match(/^# \d+\./gm) ?? []).length;
  if (found < SECTIONS) warnings.push(`${where}: разделов ${found} из ${SECTIONS}`);

  // §7.1 — макет экрана. Спрашивается только у принятых спек: раздел появился
  // после того, как первые тридцать были написаны, и требовать картинку от
  // спеки, до которой очередь дойдёт через месяц, значит получить тридцать
  // одинаковых строк и перестать их читать. У принятой спеки очередь дошла —
  // она следующая в сборку, и раскладку придётся придумывать уже на ходу.
  if (meta['spec_status'] === 'approved' && !/^## 7\.1\./m.test(text)) {
    warnings.push(`${where}: спека принята, но нет §7.1 — макета экрана`);
  }
  const screen = /^## 7\.1\.[\s\S]*?!\[[^\]]*\]\(([^)]+)\)/m.exec(text);
  if (screen && !existsSync(new URL(`./${screen[1]}`, import.meta.url))) {
    errors.push(`${where}: §7.1 ссылается на ${screen[1]}, а файла нет`);
  }
  // Гипотеза — то, ради чего собирается прототип (Definition of Ready).
  // Спрашивается с принятых: тридцать спек написаны до появления поля, и
  // вечное предупреждение по каждой перестанут читать.
  const hypothesis = meta['hypothesis'];
  const noHypothesis = typeof hypothesis !== 'string' || hypothesis.trim() === '';
  if (meta['spec_status'] === 'approved' && noHypothesis) {
    errors.push(`${where}: spec_status=approved без hypothesis`);
  } else if (noHypothesis) {
    // Копится и печатается одной строкой: тридцать одинаковых предупреждений
    // утопят те два, которые про конкретную спеку, и читать перестанут оба.
    withoutHypothesis.push(slugFromName);
  }

  // Нерешённый вопрос помечается OPEN и не даёт перевести спеку в approved.
  if (meta['spec_status'] === 'approved' && /\bOPEN\b/.test(text)) {
    errors.push(`${where}: spec_status=approved, но в тексте остался OPEN`);
  }
  // Словарь семейств открытый, форма — нет: по «route puzzle / grid
  // navigation.» и «Route» нельзя сгруппировать, а группировать по семейству
  // придётся при выборе следующих идей.
  const family = meta['family'];
  if (family === undefined) warnings.push(`${where}: нет family`);
  else if (!/^[a-zа-я0-9]+(-[a-zа-я0-9]+)*$/.test(String(family))) {
    warnings.push(`${where}: family «${String(family)}» — нужны строчные через дефис`);
  }
  if (text.includes('TODO:')) warnings.push(`${where}: остался TODO`);

  // Неотвеченный крайний случай — это либо вопрос от агента посреди сборки,
  // либо молча выдуманное правило. Второе хуже: игра расходится со спекой, и
  // измеряется не то, что описано.
  const unanswered = (text.match(/^\s*- \[ \]/gm) ?? []).length;
  if (unanswered > 0) warnings.push(`${where}: ${unanswered} неотвеченных пунктов`);

  // Шапка идеи — источник, спека наследник. Расхождение значит, что одну из
  // двух правили руками, и дальше по конвейеру поедет неизвестно какая версия.
  const idea = ideas.get(slugFromName);

  // Gate 2 спрашивается только со спек, у которых есть идея: 1–35 писались до
  // того, как этап появился, и требовать с них поле значит держать тридцать
  // вечных предупреждений, которые перестанут читать.
  if (meta['spec_status'] === undefined) warnings.push(`${where}: нет spec_status`);
  if (meta['spec_status'] === 'approved' && !meta['spec_reviewed']) {
    errors.push(`${where}: spec_status=approved без даты`);
  } else if (typeof meta['spec_reviewed'] === 'string' && meta['spec_reviewed'] !== ''
    && !/^\d{4}-\d{2}-\d{2}$/.test(meta['spec_reviewed'])) {
    errors.push(`${where}: spec_reviewed «${String(meta['spec_reviewed'])}» — нужен формат YYYY-MM-DD`);
  }

  if (idea) {
    for (const key of INHERITED) {
      if (idea.meta[key] === undefined) continue;
      if (JSON.stringify(idea.meta[key]) !== JSON.stringify(meta[key])) {
        errors.push(`${where}: ${key} разошлось с ideas/${idea.folder}/${idea.file}`);
      }
    }
    // Спека, дожившая до сборки и убитая на review.md, отклонена не на
    // Gate 1 — это разные рубежи, и код с ней остаётся в репозитории
    // нарочно (app/games/_REVIEW.md, «когда ответ — убить»).
    if (idea.meta['gate1'] === 'rejected' && !killed(slugFromName)) {
      errors.push(`${where}: спека есть, а идея отклонена на Gate 1`);
    } else if (idea.meta['gate1'] !== 'approved' && !(idea.meta['gate1'] === 'rejected' && killed(slugFromName))) {
      // Не ошибка: планка Gate 1 может смениться под уже написанной спекой
      // (2026-09-21, `prototypeability ≥ 4`). Решение — человека, а сборку
      // всему репозиторию это ронять не должно.
      warnings.push(`${where}: идея на Gate 1 в статусе ${String(idea.meta['gate1'])} — спека ждёт решения`);
    }
  }
}

// Реестр: games.json задаёт день → слаг. Слаг там обязан быть слагом спеки —
// это то самое «один слаг на игру, решается один раз» из docs/PLAY.md.
// Пока проверки не было, день 1 успел разойтись: incoming-box против
// box-arrives. Тексты постов лежат под слагом спеки, так что расхождение
// означает день без постов — и заметно это стало бы только в день выхода.
const registry = JSON.parse(readFileSync(new URL('../games.json', import.meta.url), 'utf8'));
const scheduled = new Set();

for (const game of registry.games) {
  if (!game.slug) continue;
  if (!specs.has(game.slug)) {
    errors.push(`games.json день ${String(game.day)}: слага «${game.slug}» нет в specs/`);
  }
  if (scheduled.has(game.slug)) {
    errors.push(`games.json: слаг «${game.slug}» стоит на двух днях`);
  }
  scheduled.add(game.slug);
}

/** Концепт, закрытый на воротах: `rejected` в приёмке игры. */
function killed(slug) {
  const url = new URL(`../app/games/${slug}/review.md`, import.meta.url);
  let meta;
  try {
    meta = parseFrontMatter(readFileSync(url, 'utf8')) ?? {};
  } catch {
    return false; // приёмки нет — значит игру ещё не собирали
  }
  return meta['review'] === 'rejected';
}

for (const slug of specs.keys()) {
  // «Не назначен ни на один день» у закрытого концепта читается как «назначь»,
  // а назначать его некуда: он не поедет. Доска показывает его стадией
  // «убита», и это единственное, что про него нужно знать.
  if (!scheduled.has(slug) && !killed(slug)) {
    warnings.push(`specs/${slug}: не назначен ни на один день в games.json`);
  }
}

if (withoutHypothesis.length > 0) {
  warnings.push(
    `hypothesis нет у ${withoutHypothesis.length} спек: поле появилось после того, как их написали. ` +
      'Заполняется к приёмке — без него spec_status: approved не ставится',
  );
}

for (const line of warnings) console.log(`предупреждение  ${line}`);
for (const line of errors) console.log(`ОШИБКА          ${line}`);

console.log(
  `\nспек: ${String(specs.size)}, ошибок: ${String(errors.length)}, ` +
    `предупреждений: ${String(warnings.length)}`,
);

process.exit(errors.length > 0 ? 1 : 0);
