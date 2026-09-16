import { uiButton, uiEl, type UiButtonOptions } from '../../ui-kit/index.ts';

export type PopupAction = Omit<UiButtonOptions, 'block'>;

export interface PopupOptions {
  testId: string;
  emoji: string;
  title: string;
  body?: string;
  actions: readonly PopupAction[];
}

/**
 * The one popup shape in the shell.
 *
 * Today it backs the win popup. A loss popup — which the current
 * Shell/Mechanic contract has no way to trigger, see docs/decisions.md
 * D-007 — would be built from exactly this function and nothing else.
 */
export function Popup(options: PopupOptions): HTMLElement {
  return uiEl('div', { className: 'popup-overlay', testId: options.testId }, [
    uiEl(
      'div',
      { className: 'popup', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      [
        uiEl('div', { className: 'popup__emoji', text: options.emoji, attrs: { 'aria-hidden': 'true' } }),
        uiEl('h3', { className: 'popup__title', text: options.title }),
        options.body === undefined ? null : uiEl('p', { className: 'popup__body', text: options.body }),
        uiEl(
          'div',
          { className: 'popup__actions' },
          options.actions.map((action) => uiButton({ ...action, block: true })),
        ),
      ],
    ),
  ]);
}
