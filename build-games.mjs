#!/usr/bin/env node
// Builds the Prototype Validation Project log: the card grid and one page per published prototype.
// Source of truth: games.json. Run: node build-games.mjs
// Note: the hrytsko.com project-listing tile is a separate repo and is no longer
// kept in sync automatically — update its status text by hand when it drifts far.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecs } from './specs/front-matter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(root, 'games.json'), 'utf8'));

// Название и питч живут в шапке спеки и больше нигде. games.json держит
// расписание, ссылки и цифры — то, чего в спеке нет и быть не должно.
// Раньше они лежали в обоих файлах, расходились молча, и на сайт попадала та
// версия, которую последней правили руками.
const specs = loadSpecs(join(root, 'specs'));

for (const game of data.games) {
  const spec = game.slug ? specs.get(game.slug) : undefined;
  if (game.slug && !spec) {
    // Не роняем сборку хаба целиком из-за одного отсутствующего дня: спека
    // может быть в процессе переписывания. node specs/validate.mjs уже
    // ловит это как ошибку — здесь достаточно предупреждения и пропуска.
    // Карточка непубликованного дня (status !== 'published') title/pitch не
    // читает, так что null безопасен; для published это будет заметно на
    // странице как "null" — сигнал чинить раньше, на шаге release.mjs.
    console.warn(`build-games.mjs: games.json день ${game.day} — нет specs/*-${game.slug}.md, день пропущен`);
  }
  game.title = spec ? spec.meta.title_en : null;
  game.pitch = spec ? spec.meta.pitch_en : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PLATFORMS = { itch: 'itch.io', youtube: 'YouTube', x: 'X', threads: 'Threads' };
const count = (value) => value.toLocaleString('en-GB');
const percent = (value) => `${value.toLocaleString('en-GB')}%`;
const METRICS = {
  qualifiedPlayers: { label: 'Qualified players', format: count },
  clarityRate: { label: 'Understood the mechanic', format: percent },
  retryRate: { label: 'Retried after failure', format: percent },
  moreRate: { label: 'Wanted more content', format: percent },
  returnRate: { label: 'Returned', format: percent },
  votes: { label: 'Player votes', format: count }
};

const esc = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dayLabel = (day) => `Day ${String(day).padStart(2, '0')}`;
const longDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};
// Cards are narrow, so they carry an abbreviated month.
const shortDate = (iso) => {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1].slice(0, 3)}`;
};
const addDays = (iso, offset) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const scheduledDate = (game) => game.date || addDays(data.project.startDate, game.day - 1);

// Cards ship in chronological source order and stay that way on the page.
function logCard(game) {
  const date = scheduledDate(game);
  if (game.status !== 'published') {
    const scheduledClass = game.status === 'scheduled' ? ' log-card--scheduled' : '';
    return `<article class="log-card log-card--planned${scheduledClass}" data-shuffle-card><span class="log-date">${esc(dayLabel(game.day))} · ${esc(shortDate(date))}</span><span class="log-status">${game.status === 'scheduled' ? 'Scheduled' : 'Planned'}</span></article>`;
  }
  const playUrl = game.links.play || game.links.itch || `./${game.slug}/`;
  const external = /^https?:\/\//.test(playUrl);
  const externalAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<article class="log-card log-card--published" data-shuffle-card data-prototype-id="${game.day}">
<div class="log-cover geo-cover" aria-hidden="true"></div>
<div class="log-info"><span class="log-date">${esc(dayLabel(game.day))} · ${esc(shortDate(date))}</span><h3>${esc(game.title)}</h3><p>${esc(game.pitch)}</p><a class="button button--compact" href="${esc(playUrl)}" data-track="prototype_play_clicked" data-prototype-id="${game.day}" data-prototype-slug="${esc(game.slug)}"${externalAttrs}>Play <span aria-hidden="true">↗</span></a></div>
</article>`;
}

function upcomingCard(game) {
  if (!game) return `<section class="upcoming-card upcoming-card--empty"><div><span class="card-label">Up next</span><h2>Prototype in preparation</h2><p>The next release will appear here when its date is locked.</p></div></section>`;
  const date = scheduledDate(game);
  return `<section class="upcoming-card" data-upcoming-card data-release-date="${esc(date)}" aria-labelledby="upcoming-title">
<div><span class="card-label" data-upcoming-label>Next release</span><h2 id="upcoming-title">Prototype ${String(game.day).padStart(2, '0')}</h2><p>The title and mechanic stay under wraps until release.</p></div>
<div class="upcoming-date"><span>${esc(MONTHS[Number(date.slice(5, 7)) - 1])}</span><strong>${Number(date.slice(8, 10))}</strong><small>${date.slice(0, 4)}</small></div>
</section>`;
}

// itch is skipped here when it already carries the primary Play button.
function platformLinks(links, skip = []) {
  return Object.entries(PLATFORMS)
    .filter(([key]) => links[key] && !skip.includes(key))
    .map(([key, label]) => `<a class="text-link" href="${esc(links[key])}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`)
    .join('');
}

function statCards(metrics, updated) {
  const cards = Object.entries(METRICS)
    .filter(([key]) => Number.isFinite(metrics[key]))
    .map(([key, metric]) => `<div class="stat-card reveal"><strong>${metric.format(metrics[key])}</strong><span>${metric.label}</span></div>`);
  if (!cards.length) return '';
  const note = updated ? `\n<p class="small">Figures recorded by hand on ${esc(longDate(updated))}.</p>` : '';
  return `\n<section class="detail-block">
<h2>How it landed</h2>
<div class="stat-cards stat-cards--inline">${cards.join('')}</div>${note}
</section>`;
}

// Feedback is a hand-written summary of reactions gathered across platforms, not quoted comments.
function feedback(summary = {}) {
  const liked = summary.liked || [];
  const didntWork = summary.didntWork || [];
  if (!liked.length && !didntWork.length) return '';
  const card = (label, items, variant) => items.length
    ? `<article class="flat-card reveal"><span class="card-label">${label}</span><ul class="feedback-list feedback-list--${variant}">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></article>`
    : '';
  return `\n<section class="detail-block">
<h2>What players said</h2>
<div class="card-grid">${card('Liked', liked, 'liked')}${card('Didn’t work', didntWork, 'flat')}</div>
</section>`;
}

function notes(note) {
  const blocks = [];
  if (note.tried) blocks.push(`<section class="detail-block"><h2>What I tried</h2><p>${esc(note.tried)}</p></section>`);
  if (note.change) blocks.push(`<section class="detail-block"><h2>What I would change</h2><p>${esc(note.change)}</p></section>`);
  return blocks.length ? `\n${blocks.join('\n')}` : '';
}

function gamePage(game, next) {
  const playUrl = game.links.play || game.links.itch;
  const play = playUrl
    ? `<a class="button" href="${esc(playUrl)}" target="_blank" rel="noopener noreferrer" data-track="prototype_play_clicked" data-prototype-id="${game.day}" data-prototype-slug="${esc(game.slug)}">Play <span aria-hidden="true">↗</span></a>`
    : '';
  const nextLink = next && next.status === 'published'
    ? `<a class="next-project" href="../${esc(next.slug)}/"><div><span class="meta">${esc(dayLabel(next.day))}</span><br><strong>${esc(next.title)}</strong></div><span aria-hidden="true">→</span></a>`
    : `<a class="next-project" href="../"><div><span class="meta">Back to the log</span><br><strong>Prototype Validation Project</strong></div><span aria-hidden="true">→</span></a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(game.title)} — Prototype Validation Project</title>
<meta name="description" content="${esc(game.pitch || game.title)}">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="stylesheet" href="../styles.css">
<script src="../analytics-config.js" defer></script>
<script src="../hub.js" defer></script>
<meta name="theme-color" content="#ededeb">
</head>
<body data-prototype-id="${game.day}" data-prototype-slug="${esc(game.slug)}">
<a class="skip" href="#main">Skip to content</a>
<header>
<div class="wrap nav"><a class="wordmark" href="https://hrytsko.com/" aria-label="Stas Hrytsko home">SH<span>.</span></a>
<nav aria-label="Main navigation"><a href="https://hrytsko.com/experience/">Career</a><a href="https://hrytsko.com/projects/">Projects</a></nav>
</div>
</header>
<main class="wrap" id="main">
<section class="page-hero"><a class="back" href="../">← Prototype Validation Project</a>
<div class="meta">${esc(dayLabel(game.day))} / ${esc(longDate(game.date))}</div>
<h1>${esc(game.title)}</h1>
${game.pitch ? `<p class="lede">${esc(game.pitch)}</p>` : ''}
<div class="actions">${play}${platformLinks(game.links, play ? ['itch'] : [])}</div>
</section>
<article class="detail-body">${statCards(game.metrics, data.metricsUpdated)}${notes(game.notes)}${feedback(game.feedback)}
</article>
${nextLink}
</main>
<footer class="wrap"><div class="analytics-notice"><div><span class="meta">Analytics notice</span><p>This experiment uses product analytics to measure interaction, retry and return behaviour. It does not ask for names or build advertising profiles.</p></div><button class="analytics-toggle" type="button" data-analytics-toggle hidden>Opt out</button></div><div class="footer"><span>© 2026 Stas Hrytsko</span><span>Valencia, Spain</span><a href="#main">Back to the top ↑</a></div></footer>
</body>
</html>
`;
}

const games = [...data.games].sort((a, b) => a.day - b.day);

// Keep the overview summary in sync with actual published games.
const publishedCount = games.filter((game) => game.status === 'published').length;
const stage = publishedCount >= 30 ? 'Completed' : publishedCount > 0 ? 'In progress' : 'Planning';
const readyText = publishedCount === 0
  ? 'The hub structure, 30-slot schedule and analytics instrumentation are in place. The first playable build and PostHog project token are the next milestones.'
  : `${publishedCount} of 30 prototypes published. Play the completed entries, vote and follow the evidence behind each result.`;

function updateSummary(html) {
  return html
    .replace(/<!-- stage:30-games:start -->[\s\S]*?<!-- stage:30-games:end -->/g, `<!-- stage:30-games:start -->${stage}<!-- stage:30-games:end -->`)
    .replace(/<!-- count:30-games:start -->[\s\S]*?<!-- count:30-games:end -->/g, `<!-- count:30-games:start -->${publishedCount}<!-- count:30-games:end -->`)
    .replace(/<!-- ready:30-games:start -->[\s\S]*?<!-- ready:30-games:end -->/g, `<!-- ready:30-games:start -->\n<p>${esc(readyText)}</p>\n<!-- ready:30-games:end -->`);
}

const grid = `<div class="log-grid" data-shuffle-grid>\n${games.map(logCard).join('\n')}\n</div>`;
const nextScheduled = games.find((game) => game.status === 'scheduled');
const upcoming = upcomingCard(nextScheduled);
const indexPath = join(root, 'index.html');
const index = readFileSync(indexPath, 'utf8');
const markers = /<!-- log:start -->[\s\S]*?<!-- log:end -->/;
if (!markers.test(index)) throw new Error('log:start / log:end markers missing in index.html');
const upcomingMarkers = /<!-- upcoming:start -->[\s\S]*?<!-- upcoming:end -->/;
if (!upcomingMarkers.test(index)) throw new Error('upcoming:start / upcoming:end markers missing in index.html');
const generatedIndex = index
  .replace(upcomingMarkers, `<!-- upcoming:start -->\n${upcoming}\n<!-- upcoming:end -->`)
  .replace(markers, `<!-- log:start -->\n${grid}\n<!-- log:end -->`);
writeFileSync(indexPath, updateSummary(generatedIndex));

let pages = 0;
games.forEach((game, i) => {
  if (game.status !== 'published') return;
  const dir = join(root, game.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), gamePage(game, games[i + 1]));
  pages += 1;
});

console.log(`log grid: ${games.length} card(s); game pages written: ${pages}`);
