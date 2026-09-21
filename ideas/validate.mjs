#!/usr/bin/env node
// Ворота Gate 1. Проверяет идеи против ideas/_TEMPLATE.md.
//
//   node ideas/validate.mjs
//
// Файл идеи обязателен: с него начинается работа над прототипом. Проверяется
// форма (шапка, восемь непустых разделов, слаг), арифметика порога и то, что
// папка соответствует решению человека.
//
// Порог решает, можно ли ставить approved. Само решение — человека: скрипт
// не пропускает идею вперёд, он только не даёт соврать о цифрах.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontMatter, loadSpecs } from '../specs/front-matter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Обязательные поля идеи — без них раздел 1–8 не дописан. Не все наследуются
// спекой без изменений: verb, pressure и emotion там формулируются заново,
// когда игра уже описана (см. INHERITED в specs/validate.mjs). `twist` в
// REQUIRED намеренно нет: пятнадцать из тридцати живых концептов держат
// `twist: []` — сильная идея не обязана иметь отдельный от давления хук,
// и требовать его значило бы дописывать твист туда, где его нет.
// kill_criterion — третья строка раздела 8, требуется сразу, а не только при
// оценке: условие похорон, записанное после первых цифр, подогнано под них.
const REQUIRED = [
  'slug', 'number', 'title_ru', 'title_en', 'verb', 'pressure',
  'emotion', 'family', 'levels', 'solver', 'kill_criterion',
];
const ENUMS = {
  levels: ['generated', 'authored'],
  solver: ['required', 'none'],
  gate1: ['pending', 'approved', 'rejected'],
};
// Шесть критериев и порог — ideas/gate1.md, единое правило проверки идеи.
const CRITERIA = ['readability', 'motivation', 'decision_pressure', 'payoff', 'differentiation', 'prototypeability'];
const SECTIONS = 8;

// Три условия порога, и два последних суммой не компенсируются: балл ниже
// трёх — дыра в концепте, а идея, которую нельзя проверить за вечер, отнимает
// не один день, а несколько прототипов.
const MIN_TOTAL = 24;
const MIN_EACH = 3;
const MIN_PROTOTYPEABILITY = 4;

const errors = [];
const warnings = [];
const seen = [];

/** Идеи из одной папки. Папка несёт решение человека, а не отдельное поле. */
function read(folder) {
  const dir = join(here, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .sort()
    .map((file) => ({ folder, file, where: `ideas/${folder}/${file}`, text: readFileSync(join(dir, file), 'utf8') }));
}

const files = [...read('active'), ...read('rejected')];

if (files.length === 0) {
  console.log('идей: 0');
  process.exit(0);
}

const specs = loadSpecs(join(root, 'specs'));

for (const { folder, file, where, text } of files) {
  const meta = parseFrontMatter(text);

  if (meta === null) {
    errors.push(`${where}: нет YAML-шапки`);
    continue;
  }

  for (const key of REQUIRED) {
    const value = meta[key];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      errors.push(`${where}: в шапке нет ${key}`);
    }
  }

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (meta[key] !== undefined && meta[key] !== null && !allowed.includes(meta[key])) {
      errors.push(`${where}: ${key}=${String(meta[key])}, допустимо ${allowed.join(' | ')}`);
    }
  }

  const slugFromName = file.replace(/^\d+-/, '').replace(/\.md$/, '');
  if (meta['slug'] !== slugFromName) {
    errors.push(`${where}: slug «${String(meta['slug'])}» не совпадает с именем файла`);
  }
  if (seen.includes(slugFromName)) errors.push(`${where}: слаг «${slugFromName}» уже занят другой идеей`);
  seen.push(slugFromName);

  const spec = specs.get(slugFromName);
  if (spec && spec.meta['number'] !== meta['number']) {
    errors.push(`${where}: номер ${String(meta['number'])}, а у specs/${spec.file} — ${String(spec.meta['number'])}`);
  }

  // Разделы 1–8 пишет автор. Пустой раздел молчанием не проходит: по пустому
  // месту нельзя отличить «решил, что не нужно» от «не дошёл».
  const parts = text.split(/^## (\d)\./gm);
  const filled = new Set();
  for (let i = 1; i < parts.length; i += 2) {
    const body = (parts[i + 1] ?? '').trim().split('\n').slice(1).join('').trim();
    if (body !== '') filled.add(Number(parts[i]));
  }
  for (let n = 1; n <= SECTIONS; n += 1) {
    if (!filled.has(n)) errors.push(`${where}: раздел ${n} пуст или отсутствует`);
  }

  // --- Gate 1 -------------------------------------------------------------

  const gate = meta['gate1'] ?? 'pending';
  const score = meta['score'];
  const scored = score !== undefined && score !== null && typeof score === 'object';

  if (!scored) {
    if (gate === 'pending') warnings.push(`${where}: не оценена`);
    else errors.push(`${where}: gate1=${gate} без оценки`);
  } else {
    const missing = CRITERIA.filter((c) => typeof score[c] !== 'number');
    const bad = CRITERIA.filter((c) => typeof score[c] === 'number' && (score[c] < 1 || score[c] > 5));
    if (missing.length > 0) errors.push(`${where}: в score нет ${missing.join(', ')}`);
    if (bad.length > 0) errors.push(`${where}: в score вне диапазона 1–5: ${bad.join(', ')}`);

    if (missing.length === 0 && bad.length === 0) {
      const total = CRITERIA.reduce((sum, c) => sum + score[c], 0);
      const low = CRITERIA.filter((c) => score[c] < MIN_EACH);
      const reasons = [];
      if (total < MIN_TOTAL) reasons.push(`сумма ${total} < ${MIN_TOTAL}`);
      if (low.length > 0) reasons.push(`ниже ${MIN_EACH}: ${low.join(', ')}`);
      if (score['prototypeability'] < MIN_PROTOTYPEABILITY) {
        reasons.push(`prototypeability ${score['prototypeability']} < ${MIN_PROTOTYPEABILITY}`);
      }

      // Скрипт не решает за человека — он ловит только approved вопреки цифрам.
      if (gate === 'approved' && reasons.length > 0) {
        errors.push(`${where}: gate1=approved, но порог не взят (${reasons.join('; ')})`);
      }
      if (gate === 'pending' && reasons.length > 0) {
        warnings.push(`${where}: порог не взят — ${reasons.join('; ')}`);
      }
      // Полоса решения из ideas/gate1.md: она не ворота, а подсказка, с чего
      // начинать очередь, поэтому печатается и при взятом пороге.
      if (gate === 'pending' && reasons.length === 0) {
        const band = total >= 26 ? 'приоритетный прототип' : 'обычный прототип';
        warnings.push(`${where}: порог взят, сумма ${total} — ${band}, ждёт решения`);
      }
    }
  }

  if (gate !== 'pending' && !meta['gate1_date']) {
    errors.push(`${where}: gate1=${gate} без даты`);
  } else if (typeof meta['gate1_date'] === 'string' && meta['gate1_date'] !== ''
    && !/^\d{4}-\d{2}-\d{2}$/.test(meta['gate1_date'])) {
    // «20 september 2026» не сортируется и не вычитается.
    errors.push(`${where}: gate1_date «${String(meta['gate1_date'])}» — нужен формат YYYY-MM-DD`);
  }

  // Папка и решение — одно и то же состояние, записанное дважды. Расхождение
  // значит, что файл переложили, а поле забыли, или наоборот.
  if (folder === 'rejected' && gate !== 'rejected') {
    errors.push(`${where}: лежит в rejected/, а gate1=${gate}`);
  }
  if (folder === 'active' && gate === 'rejected') {
    errors.push(`${where}: gate1=rejected, но файл не переехал в ideas/rejected/`);
  }

  // Спека при неодобренной идее. Предупреждение, а не ошибка: планка Gate 1
  // может смениться под уже написанной спекой — так и случилось 2026-09-21,
  // когда `prototypeability ≥ 4` вернуло arrow-flip в pending. Это вопрос
  // очереди к человеку, а не повод ронять сборку всему репозиторию.
  //
  // Спека, дожившая до сборки и убитая на review.md (app/games/<slug>/),
  // убита не на Gate 1 — это разные рубежи, и код с ней остаётся в
  // репозитории нарочно (app/games/_REVIEW.md, «когда ответ — убить»).
  // Так gate1=rejected при живой спеке не значит «забыли удалить», а
  // отдельная ошибка «rejected, но спека на месте» ловит именно тот случай,
  // где спека появилась раньше отказа и должна была исчезнуть.
  const killedAtReview = existsSync(join(root, 'app', 'games', slugFromName, 'review.md'))
    && /^review: rejected$/m.test(readFileSync(join(root, 'app', 'games', slugFromName, 'review.md'), 'utf8'));

  if (spec && gate === 'rejected' && !killedAtReview) {
    errors.push(`${where}: gate1=rejected, а specs/${spec.file} на месте`);
  } else if (spec && gate !== 'approved' && !(gate === 'rejected' && killedAtReview)) {
    warnings.push(`${where}: есть specs/${spec.file}, но gate1=${gate} — спека ждёт решения`);
  }
}

for (const line of warnings) console.log(`предупреждение  ${line}`);
for (const line of errors) console.log(`ОШИБКА          ${line}`);

console.log(`\nидей: ${String(files.length)}, ошибок: ${String(errors.length)}, предупреждений: ${String(warnings.length)}`);

process.exit(errors.length > 0 ? 1 : 0);
