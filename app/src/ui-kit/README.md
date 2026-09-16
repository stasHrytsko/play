# UI Kit v0.1

Shared interface primitives for all 30/30 puzzle prototypes.

## What belongs here

- reusable DOM UI: buttons, counters, objective cards, progress
- recurring gameplay UI: queues, inventory slots, countdowns, risk meters
- shared theme bridge and visual states

## What does not belong here

- game rules or game-specific state
- Phaser scene logic
- navigation, progress persistence, analytics or shell lifecycle
- juice animations (`src/render-kit` owns those)

## Usage

Import from the barrel. The stylesheet is included automatically:

```ts
import { counter, inventoryTray, nextQueue, objectiveCard, uiButton } from '../../src/ui-kit/index.ts';
```

A game should pass its state into the component instead of teaching the component game-specific rules.

```ts
const objective = objectiveCard({
  text: 'Clear all the blocks.',
  current: 3,
  target: 8,
  testId: 'objective',
});

const tray = inventoryTray({
  testId: 'tray',
  slots: [
    { id: 'a', item: { id: 'blue', tone: 'blue' } },
    { id: 'b', item: { id: 'sage', tone: 'sage' } },
    { id: 'c' },
    { id: 'd', locked: true },
  ],
});
```

## Visual rules

The kit intentionally follows the project site's calm visual language:

- warm off-white surfaces
- graphite text
- terracotta as the main brand accent
- muted blue, sage, mustard, rose and lavender gameplay colours
- almost-flat controls with subtle shadows
- game pieces stay tactile: light top edge, tiny lower inset and soft cast shadow

All colours come from `src/styles/tokens.css`. Do not hard-code colours in game scenes.

## Architecture

`ui-kit` = what the interface is made of.

`render-kit` = how game objects move, punch, shake, collapse and flash.

`shell` = application navigation, onboarding, progress, feedback and lifecycle.

`games/<slug>/mechanic` = the unique rule system for one prototype.
