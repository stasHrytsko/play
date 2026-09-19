// Читает YAML-шапки спек (раздел 0 в specs/_TEMPLATE.md).
//
// Разбирается ровно то подмножество YAML, которое шаблон разрешает: скаляры,
// списки строк, вложенные карты в один уровень и свёрнутые блоки `>-`. Полный
// YAML сюда не тянется намеренно — ни у хаба, ни у дистрибуции нет package.json
// и зависимостей, и заводить их ради одного парсера дороже, чем сорок строк.
//
// Если шапка перестанет попадать в это подмножество, упадёт specs/validate.mjs
// в CI, а не тихо разъедутся тексты на сайте.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const specsDir = dirname(fileURLToPath(import.meta.url));

const INDENT = /^(\s+)(.*)$/;

/** Скаляр: null, число, true/false или строка. Хвостовой комментарий снимается. */
function scalar(raw) {
  let value = raw.trim();
  if (value === '') return '';
  // « # » — комментарий, «#» внутри слова — часть текста.
  const comment = value.search(/(^|\s)#/);
  if (comment !== -1) value = value.slice(0, comment === 0 ? 0 : comment).trim();
  if (value === '[]') return [];
  if (value === 'null' || value === '~' || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^'.*'$/.test(value) || /^".*"$/.test(value)) return value.slice(1, -1);
  return value;
}

/** Свёрнутый блок `>-`: строки склеиваются пробелом, пустая строка — абзац. */
function folded(lines) {
  const out = [];
  for (const line of lines) {
    const text = line.trim();
    if (text === '') out.push('\n');
    else if (out.length > 0 && out[out.length - 1] !== '\n') out[out.length - 1] += ` ${text}`;
    else out.push(text);
  }
  return out.join(' ').replace(/ ?\n ?/g, '\n').trim();
}

/**
 * Разбирает шапку документа. Возвращает объект полей или null, если шапки нет.
 */
export function parseFrontMatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;

  const lines = text.slice(4, end).split('\n');
  const out = {};
  let i = 0;

  while (i < lines.length) {
    const match = /^([A-Za-z_][\w]*):(.*)$/.exec(lines[i]);
    if (!match) { i += 1; continue; }
    const key = match[1];
    const rest = match[2];
    i += 1;

    // Собираем блок вложенных строк — всё, что с отступом до следующего ключа.
    const block = [];
    while (i < lines.length && (lines[i].trim() === '' || INDENT.test(lines[i]))) {
      block.push(lines[i]);
      i += 1;
    }
    while (block.length > 0 && block[block.length - 1].trim() === '') block.pop();

    if (rest.trim() === '>-' || rest.trim() === '>' || rest.trim() === '|') {
      out[key] = folded(block);
    } else if (rest.trim() !== '') {
      out[key] = scalar(rest);
    } else if (block.some((l) => /^\s+-\s/.test(l))) {
      out[key] = block.filter((l) => /^\s+-\s/.test(l)).map((l) => scalar(l.trim().slice(2)));
    } else if (block.length > 0) {
      const map = {};
      for (const line of block) {
        const pair = /^\s+([A-Za-z_][\w]*):(.*)$/.exec(line);
        if (pair) map[pair[1]] = scalar(pair[2]);
      }
      out[key] = map;
    } else {
      out[key] = [];
    }
  }

  return out;
}

/**
 * Все спеки папки: Map слаг → { file, number, meta }. Слаг берётся из имени
 * файла — валидатор отдельно следит, чтобы он совпадал с полем в шапке.
 */
export function loadSpecs(dir = specsDir) {
  const specs = new Map();
  for (const file of readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort()) {
    const text = readFileSync(join(dir, file), 'utf8');
    const slug = file.replace(/^\d+-/, '').replace(/\.md$/, '');
    specs.set(slug, {
      file,
      number: Number(file.slice(0, file.indexOf('-'))),
      meta: parseFrontMatter(text) ?? {},
      text,
    });
  }
  return specs;
}
