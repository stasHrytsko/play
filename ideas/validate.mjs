#!/usr/bin/env node
// Проверяет идеи против docs/templates/idea.md.
//
//   node ideas/validate.mjs
//
// Ворота этапа IDEA: шапка на месте, восемь разделов непусты, слаг свободен.
// Пустая папка — не ошибка: этап начинается с концепта 36, см. ideas/README.md.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontMatter, loadSpecs } from '../specs/front-matter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Поля, которые переезжают в шапку спеки без изменений. pitch_* и score здесь
// намеренно отсутствуют: на этапе идеи их честно не из чего взять.
const REQUIRED = ['slug', 'number', 'title_ru', 'title_en', 'verb', 'pressure', 'emotion', 'levels', 'solver'];
const ENUMS = { levels: ['generated', 'authored'], solver: ['required', 'none'] };
const SECTIONS = 8;

const errors = [];
const files = readdirSync(here).filter((f) => /^\d+-.*\.md$/.test(f)).sort();

if (files.length === 0) {
  console.log('идей: 0 — этап начинается с концепта 36, см. ideas/README.md');
  process.exit(0);
}

const specs = loadSpecs(join(root, 'specs'));

for (const file of files) {
  const where = `ideas/${file}`;
  const text = readFileSync(join(here, file), 'utf8');
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
    if (meta[key] !== undefined && !allowed.includes(meta[key])) {
      errors.push(`${where}: ${key}=${String(meta[key])}, допустимо ${allowed.join(' | ')}`);
    }
  }

  const slugFromName = file.replace(/^\d+-/, '').replace(/\.md$/, '');
  if (meta['slug'] !== slugFromName) {
    errors.push(`${where}: slug «${String(meta['slug'])}» не совпадает с именем файла`);
  }

  // Слаг решается один раз. Спека с тем же слагом — это не конфликт, а
  // следующий шаг той же идеи; конфликт был бы с чужим слагом, но такой
  // случай ловится тем, что имена файлов в одной папке уникальны.
  const spec = specs.get(slugFromName);
  if (spec && spec.meta['number'] !== meta['number']) {
    errors.push(`${where}: номер ${String(meta['number'])}, а у specs/${spec.file} — ${String(spec.meta['number'])}`);
  }

  // Разделы: «## 1.» … «## 8.». Пустой раздел молчанием не проходит.
  const parts = text.split(/^## (\d)\./gm);
  const filled = new Set();
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i + 1] && parts[i + 1].trim().split('\n').slice(1).join('').trim() !== '') {
      filled.add(Number(parts[i]));
    }
  }
  for (let n = 1; n <= SECTIONS; n += 1) {
    if (!filled.has(n)) errors.push(`${where}: раздел ${n} пуст или отсутствует`);
  }
}

for (const line of errors) console.log(`ОШИБКА  ${line}`);
console.log(`\nидей: ${String(files.length)}, ошибок: ${String(errors.length)}`);

process.exit(errors.length > 0 ? 1 : 0);
