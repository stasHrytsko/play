import { uiEl } from './dom.ts';

export type GamePieceTone = 'blue' | 'sage' | 'mustard' | 'terracotta' | 'rose' | 'lavender' | 'neutral';

export interface QueueItem {
  id: string;
  tone: GamePieceTone;
  label?: string;
  state?: 'normal' | 'locked' | 'covered' | 'hidden';
}

function piece(item: QueueItem, className: string): HTMLElement {
  const state = item.state ?? 'normal';
  return uiEl('div', {
    className: `${className} ui-piece ui-piece--${item.tone} ui-piece--${state}`,
    text: state === 'hidden' ? '?' : item.label,
    attrs: { 'aria-label': item.label ?? `${item.tone} piece` },
  });
}

export interface QueueOptions {
  items: readonly QueueItem[];
  next?: QueueItem;
  testId?: string;
}

export function nextQueue(options: QueueOptions): HTMLElement {
  const visible = uiEl(
    'div',
    { className: 'ui-queue__items' },
    options.items.map((item) => piece(item, 'ui-queue__item')),
  );

  const next =
    options.next === undefined
      ? null
      : uiEl('div', { className: 'ui-queue__next' }, [
          uiEl('span', { className: 'ui-queue__caption', text: 'Next' }),
          piece(options.next, 'ui-queue__next-piece'),
        ]);

  return uiEl('section', { className: 'ui-queue', testId: options.testId, attrs: { 'aria-label': 'Queue' } }, [visible, next]);
}

export interface InventorySlot {
  id: string;
  item?: QueueItem;
  locked?: boolean;
}

export interface InventoryTrayOptions {
  slots: readonly InventorySlot[];
  testId?: string;
}

export function inventoryTray(options: InventoryTrayOptions): HTMLElement {
  const used = options.slots.filter((slot) => slot.item !== undefined).length;

  return uiEl('section', { className: 'ui-inventory', testId: options.testId, attrs: { 'aria-label': 'Inventory' } }, [
    uiEl(
      'div',
      { className: 'ui-inventory__slots' },
      options.slots.map((slot) => {
        if (slot.locked === true) {
          return uiEl('div', { className: 'ui-slot ui-slot--locked', text: '•', attrs: { 'aria-label': 'Locked slot' } });
        }
        if (slot.item === undefined) {
          return uiEl('div', { className: 'ui-slot ui-slot--empty', attrs: { 'aria-label': 'Empty slot' } });
        }
        return uiEl('div', { className: 'ui-slot' }, [piece(slot.item, 'ui-slot__piece')]);
      }),
    ),
    uiEl('span', { className: 'ui-inventory__count', text: `${String(used)} / ${String(options.slots.length)}` }),
  ]);
}

export interface CountdownOptions {
  value: number;
  label?: string;
  criticalAt?: number;
  icon?: string;
  testId?: string;
}

export function countdown(options: CountdownOptions): HTMLElement {
  const critical = options.value <= (options.criticalAt ?? 1);
  return uiEl(
    'div',
    {
      className: `ui-countdown${critical ? ' ui-countdown--critical' : ''}`,
      testId: options.testId,
      attrs: { 'aria-label': `${options.label ?? 'Countdown'}: ${String(options.value)}` },
    },
    [
      options.icon === undefined
        ? null
        : uiEl('span', { className: 'ui-countdown__icon', text: options.icon, attrs: { 'aria-hidden': 'true' } }),
      uiEl('span', { className: 'ui-countdown__label', text: options.label ?? 'Turns' }),
      uiEl('strong', { className: 'ui-countdown__value', text: String(options.value) }),
    ],
  );
}

export interface RiskMeterOptions {
  value: number;
  max: number;
  label?: string;
  testId?: string;
}

export function riskMeter(options: RiskMeterOptions): HTMLElement {
  const max = Math.max(1, options.max);
  const value = Math.min(Math.max(0, options.value), max);
  const markers: Node[] = [];

  for (let index = 0; index <= max; index += 1) {
    markers.push(
      uiEl('span', {
        className: `ui-risk__dot${index <= value ? ' ui-risk__dot--active' : ''}${index === value ? ' ui-risk__dot--current' : ''}`,
        attrs: { 'aria-hidden': 'true' },
      }),
    );
  }

  return uiEl('section', { className: 'ui-risk', testId: options.testId, attrs: { 'aria-label': options.label ?? 'Risk' } }, [
    uiEl('div', { className: 'ui-risk__track' }, markers),
    uiEl('span', { className: 'ui-risk__label', text: options.label ?? 'Keep going to increase your reward.' }),
  ]);
}

export function blockStatePreview(items: readonly QueueItem[]): HTMLElement {
  return uiEl(
    'div',
    { className: 'ui-state-preview', attrs: { 'aria-label': 'Piece states' } },
    items.map((item) => piece(item, 'ui-state-preview__piece')),
  );
}
