#!/usr/bin/env node
// Проверяет спеки против specs/_TEMPLATE.md.
//
//   node specs/validate.mjs
//
// Падает только на ошибках — том, что делает спеку непригодной для сборки.
// Недозаполненное сообщается предупреждением и сборку не роняет: пробел
// должен быть виден, но не блокировать работу над другими играми.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Поля шапки, без которых спеку нельзя ни собрать, ни судить.
const REQUIRED = [
  'slug', 'number', 'title_ru', 'title_en', 'pitch_ru', 'pitch_en',
  'verb', 'pressure', 'emotion', 'levels', 'solver', 'kill_criterion',
];
const ENUMS = { levels: ['generated', 'authored'], solver: ['required', 'none'] };
// События, которых шелл не шлёт: см. src/shell/signal/SignalSink.ts.
const RETIRED = ['more_yes', 'session_2', 'return_d1', 'return_d7'];
const SECTIONS = 12; // §1..§12 заголовками; §0 — это сама YAML-шапка

/**
 * Достаточный разбор шапки: нужны только наличие ключей верхнего уровня и
 * несколько скалярных значений. Полноценный YAML тянуть в хаб без
 * зависимостей незачем.
 */
function parseFrontMatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return null;
  const block = text.slice(4, end);
  const out = {};
  let key = null;
  for (const line of block.split('\n')) {
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) {
      key = top[1];
      const value = top[2].trim();
      out[key] = value === '' || value === '>-' ? [] : value;
      continue;
    }
    if (key && /^\s+-\s+\S/.test(line) && Array.isArray(out[key])) out[key].push(line.trim().slice(2));
    else if (key && /^\s+\S/.test(line) && Array.isArray(out[key]) && out[key].length === 0) out[key] = 'текст';
  }
  return out;
}

const errors = [];
const warnings = [];

const files = readdirSync(here).filter((f) => /^\d+-.*\.md$/.test(f)).sort();

for (const file of files) {
  const text = readFileSync(join(here, file), 'utf8');
  const where = `specs/${file}`;
  const meta = parseFrontMatter(text);

  if (meta === null) {
    errors.push(`${where}: нет YAML-шапки (раздел 0 шаблона)`);
    continue;
  }

  for (const key of REQUIRED) {
    const value = meta[key];
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) errors.push(`${where}: в шапке нет ${key}`);
  }

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (meta[key] !== undefined && !allowed.includes(String(meta[key]).split('#')[0].trim())) {
      errors.push(`${where}: ${key}=${String(meta[key])}, допустимо ${allowed.join(' | ')}`);
    }
  }

  const slugFromName = file.replace(/^\d+-/, '').replace(/\.md$/, '');
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
  if (meta['score'] === undefined || String(meta['score']).startsWith('null')) {
    warnings.push(`${where}: score не разбит по шести критериям`);
  }
  if (meta['family'] === undefined) warnings.push(`${where}: нет family`);
  if (text.includes('TODO:')) warnings.push(`${where}: остался TODO`);
}

for (const line of warnings) console.log(`предупреждение  ${line}`);
for (const line of errors) console.log(`ОШИБКА          ${line}`);

console.log(
  `\nспек: ${String(files.length)}, ошибок: ${String(errors.length)}, ` +
    `предупреждений: ${String(warnings.length)}`,
);

process.exit(errors.length > 0 ? 1 : 0);
