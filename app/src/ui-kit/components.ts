import { setDisabled, uiEl } from './dom.ts';

export type UiButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost';

export interface UiButtonOptions {
  label: string;
  onClick: () => void;
  variant?: UiButtonVariant;
  icon?: string;
  testId: string;
  disabled?: boolean;
  compact?: boolean;
}

export function uiButton(options: UiButtonOptions): HTMLButtonElement {
  const classes = ['ui-button', `ui-button--${options.variant ?? 'secondary'}`];
  if (options.compact === true) classes.push('ui-button--compact');

  const children: Node[] = [];
  if (options.icon !== undefined) {
    children.push(uiEl('span', { className: 'ui-button__icon', text: options.icon, attrs: { 'aria-hidden': 'true' } }));
  }
  children.push(uiEl('span', { className: 'ui-button__label', text: options.label }));

  const node = uiEl(
    'button',
    {
      className: classes.join(' '),
      testId: options.testId,
      attrs: { type: 'button' },
    },
    children,
  );
  node.addEventListener('click', options.onClick);
  setDisabled(node, options.disabled ?? false);
  return node;
}

export interface CounterOptions {
  label: string;
  value: string | number;
  icon?: string;
  tone?: 'default' | 'warning' | 'danger';
  testId?: string;
}

export function counter(options: CounterOptions): HTMLElement {
  return uiEl(
    'div',
    {
      className: `ui-counter ui-counter--${options.tone ?? 'default'}`,
      testId: options.testId,
      attrs: { 'aria-label': `${options.label}: ${String(options.value)}` },
    },
    [
      options.icon === undefined
        ? null
        : uiEl('span', { className: 'ui-counter__icon', text: options.icon, attrs: { 'aria-hidden': 'true' } }),
      uiEl('span', { className: 'ui-counter__label', text: options.label }),
      uiEl('strong', { className: 'ui-counter__value', text: String(options.value) }),
    ],
  );
}

export interface ObjectiveCardOptions {
  title?: string;
  text: string;
  icon?: string;
  current?: number;
  target?: number;
  testId?: string;
}

export function objectiveCard(options: ObjectiveCardOptions): HTMLElement {
  const progress =
    options.current === undefined || options.target === undefined
      ? null
      : uiEl('span', {
          className: 'ui-objective__progress',
          text: `${String(options.current)} / ${String(options.target)}`,
        });

  return uiEl(
    'section',
    {
      className: 'ui-objective',
      testId: options.testId,
      attrs: { 'aria-label': options.title ?? 'Objective' },
    },
    [
      options.icon === undefined
        ? null
        : uiEl('div', { className: 'ui-objective__icon', text: options.icon, attrs: { 'aria-hidden': 'true' } }),
      uiEl('div', { className: 'ui-objective__copy' }, [
        uiEl('span', { className: 'ui-objective__title', text: options.title ?? 'Objective' }),
        uiEl('strong', { className: 'ui-objective__text', text: options.text }),
      ]),
      progress,
    ],
  );
}

export interface ProgressBarOptions {
  value: number;
  max: number;
  label?: string;
  testId?: string;
}

export function progressBar(options: ProgressBarOptions): HTMLElement {
  const max = Math.max(1, options.max);
  const value = Math.min(Math.max(0, options.value), max);
  const percent = (value / max) * 100;

  return uiEl('div', { className: 'ui-progress', testId: options.testId }, [
    uiEl('div', { className: 'ui-progress__meta' }, [
      uiEl('span', { className: 'ui-progress__label', text: options.label ?? 'Progress' }),
      uiEl('span', { className: 'ui-progress__value', text: `${String(value)} / ${String(max)}` }),
    ]),
    uiEl(
      'div',
      {
        className: 'ui-progress__track',
        attrs: {
          role: 'progressbar',
          'aria-valuemin': '0',
          'aria-valuemax': String(max),
          'aria-valuenow': String(value),
        },
      },
      [uiEl('div', { className: 'ui-progress__fill', attrs: { style: `width:${String(percent)}%` } })],
    ),
  ]);
}
