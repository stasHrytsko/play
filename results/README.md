# results/

> **Где записан Gate 2.** Вход — прототип, сыгранный живыми игроками, и
> `../data/<slug>.json`. Дальше: петля обратно в `../ideas/`.
> Путь целиком — `../docs/PLAY.md`.

Один файл на концепт: `results/NN-slug.md`. Пишет AI, подписывает человек.

**Правило проверки — `gate2.md`, рядом.** Условия и пороги живут в одном
месте с решением, которое по ним принимается. Первые ворота — `../ideas/README.md`.

## Формат

```yaml
---
slug: arrow-flip
number: 36
gate2: ready_for_production   # ready_for_production | rework | kill
decided: 2026-11-05
players: 12                   # сколько человек наблюдали, минимум 10
observed:
  start_without_explanation: 83
  understand_goal: 75
  continue_voluntarily: 67
  retry_after_loss: 58
  varied_decisions: true
  greedy_does_not_dominate: true
  five_levels_feel_different: true
  production_cost_within_limit: true
---
```

Проза — что делали игроки, где отваливались, что говорили, и **сверка с
kill-критерием из шапки идеи дословно**. Он сформулирован до первых цифр
именно для того, чтобы сейчас его нельзя было переписать.

Концепт, закрытый раньше — на проверке среза, до игроков, — записывается
здесь же: `gate2: kill`, `players: 0` и строка почему. Иначе в итогах
тридцатки будет молчаливая дыра вместо истории.

Победители собираются в индекс `results/PROMOTED.md`. Код никуда не
копируется — копия разойдётся с оригиналом на первой же правке.

`results/` — вход для следующих идей: «какое семейство побеждает» это запрос
к папке, а не к памяти.
