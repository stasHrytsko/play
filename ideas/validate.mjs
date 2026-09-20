#!/usr/bin/env node
// Ворота Gate 1. Проверяет идеи против docs/templates/idea.md.
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

// Поля, которые переезжают в шапку спеки без изменений. pitch_* здесь
// намеренно отсутствуют: формулировка рождается, когда игра уже описана.
const REQUIRED = ['slug', 'number', 'title_ru', 'title_en', 'verb', 'pressure', 'emotion', 'levels', 'solver'];
const ENUMS = {
  levels: ['generated', 'authored'],
  solver: ['required', 'none'],
  gate1: ['pending', 'approved', 'rejected'],
};
const CRITERIA = ['readability', 'motivation', 'pressure', 'payoff', 'producibility', 'market'];
const SECTIONS = 8;

// Порог Gate 1. Сумма — общая планка, производимость — отдельная и не
// компенсируется суммой: три дня работы отнимают три прототипа.
const MIN_TOTAL = 24;
const MIN_PRODUCIBILITY = 3;

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
      const passes = total >= MIN_TOTAL && score['producibility'] >= MIN_PRODUCIBILITY;

      // Скрипт не решает за человека — он ловит только approved вопреки цифрам.
      if (gate === 'approved' && !passes) {
        const why = total < MIN_TOTAL
          ? `сумма ${total} < ${MIN_TOTAL}`
          : `производимость ${score['producibility']} < ${MIN_PRODUCIBILITY}`;
        errors.push(`${where}: gate1=approved, но порог не взят (${why})`);
      }
      if (gate === 'pending' && !passes) {
        warnings.push(`${where}: порог не взят — сумма ${total}, производимость ${score['producibility']}`);
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

  // Спека может существовать только у одобренной идеи.
  if (spec && gate !== 'approved') {
    errors.push(`${where}: есть specs/${spec.file}, но gate1=${gate}`);
  }
}

for (const line of warnings) console.log(`предупреждение  ${line}`);
for (const line of errors) console.log(`ОШИБКА          ${line}`);

console.log(`\nидей: ${String(files.length)}, ошибок: ${String(errors.length)}, предупреждений: ${String(warnings.length)}`);

process.exit(errors.length > 0 ? 1 : 0);
