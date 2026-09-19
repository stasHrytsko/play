#!/usr/bin/env node
// Проверяет спеки против specs/_TEMPLATE.md.
//
//   node specs/validate.mjs
//
// Падает только на ошибках — том, что делает спеку непригодной для сборки.
// Недозаполненное сообщается предупреждением и сборку не роняет: пробел
// должен быть виден, но не блокировать работу над другими играми.

import { readFileSync } from 'node:fs';

import { loadSpecs } from './front-matter.mjs';

// Поля шапки, без которых спеку нельзя ни собрать, ни судить.
const REQUIRED = [
  'slug', 'number', 'title_ru', 'title_en', 'pitch_ru', 'pitch_en',
  'verb', 'pressure', 'emotion', 'levels', 'solver', 'kill_criterion',
];
const ENUMS = { levels: ['generated', 'authored'], solver: ['required', 'none'] };
// События, которых шелл не шлёт: см. src/shell/signal/SignalSink.ts.
const RETIRED = ['more_yes', 'session_2', 'return_d1', 'return_d7'];
const SECTIONS = 12; // §1..§12 заголовками; §0 — это сама YAML-шапка

const errors = [];
const warnings = [];

const specs = loadSpecs();

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
    errors.push(`${where}: §10 требует событий, которых шелл не шлёт: ${retired.join(', ')}`);
  }

  const pressure = Array.isArray(meta['pressure']) ? meta['pressure'] : [];
  if (pressure.length > 2) errors.push(`${where}: давлений ${pressure.length}, максимум два (§9.2)`);

  const found = (text.match(/^# \d+\./gm) ?? []).length;
  if (found < SECTIONS) warnings.push(`${where}: разделов ${found} из ${SECTIONS}`);
  if (meta['score'] === undefined || meta['score'] === null) {
    warnings.push(`${where}: score не разбит по шести критериям`);
  }
  if (meta['family'] === undefined) warnings.push(`${where}: нет family`);
  if (text.includes('TODO:')) warnings.push(`${where}: остался TODO`);
}

// Реестр: games.json задаёт день → слаг. Слаг там обязан быть слагом спеки —
// это то самое «один слаг на игру, решается один раз» из docs/pipeline.md.
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

for (const slug of specs.keys()) {
  if (!scheduled.has(slug)) warnings.push(`specs/${slug}: не назначен ни на один день в games.json`);
}

for (const line of warnings) console.log(`предупреждение  ${line}`);
for (const line of errors) console.log(`ОШИБКА          ${line}`);

console.log(
  `\nспек: ${String(specs.size)}, ошибок: ${String(errors.length)}, ` +
    `предупреждений: ${String(warnings.length)}`,
);

process.exit(errors.length > 0 ? 1 : 0);
