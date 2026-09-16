# specs/

Staging area for the 30/30 canonical shelf — one spec per concept, written
before its own day comes up, in the `docs/rules-template.md` format (inside
`app/`).

## Naming

`specs/<slug>.md` — the same `<slug>` the concept will get as
`app/games/<slug>/` on its day. Decide the slug when the spec is written,
not later; renaming a spec after code exists means renaming the game folder
too.

## Where it goes from here

On a concept's day, `app/CLAUDE.md`'s "New game" step 1 pulls the spec from
here into `app/games/<slug>/rules.md` instead of writing it from scratch —
this folder is the source, `app/games/<slug>/rules.md` is the copy that
actually ships with the game.

## Buffer games

Two specs — drawn from the "ЗАПАС" pool, not the 29 dated days — get built
all the way through ahead of schedule: a full run of the New game pipeline
(app/CLAUDE.md steps 1-9), timed step by step, logged in
`app/docs/decisions.md`. That's the schedule check for whether a day
actually fits in the 2-hour budget, not a separate tool.
