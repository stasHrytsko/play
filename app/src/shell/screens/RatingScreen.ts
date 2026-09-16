import { button, el } from '../dom.ts';

export interface RatingSubmission {
  /** 1-5. Always set — the button is disabled until the player picks one. */
  rating: number;
  /** Trimmed. Empty string if the player left it blank. */
  comment: string;
}

export interface RatingScreenHandlers {
  /** Fired once, when the player has chosen a rating and pressed the button. */
  onSubmit: (result: RatingSubmission) => void;
}

const STAR_COUNT = 5;

/**
 * Shown once, after the last level. Replaces the old "Ещё?" (yes/no) prompt
 * (docs/decisions.md, 2026-09-16): the signal is now calibrated — 1-5, not
 * yes/no — and doubles as free-text feedback.
 *
 * There is deliberately no skip/dismiss action: a rating is what Ворота 3
 * depends on. The button is "К уровням", not "Готово" — submitting and
 * returning to LevelSelect are the same action, and every level stays
 * replayable afterwards.
 */
export function RatingScreen(handlers: RatingScreenHandlers): HTMLElement {
  let rating = 0;

  const stars: HTMLButtonElement[] = [];

  const comment = el('textarea', {
    className: 'rating__comment',
    testId: 'rating-comment',
    attrs: {
      placeholder: 'Что понравилось или нет? (необязательно)',
      rows: '3',
      'aria-label': 'Комментарий',
    },
  });

  const submit = button({
    text: 'К уровням',
    variant: 'primary',
    block: true,
    testId: 'rating-submit',
    onClick: () => {
      if (rating === 0) return; // Disabled below; this is belt and braces.
      handlers.onSubmit({ rating, comment: comment.value.trim() });
    },
  });
  submit.disabled = true;

  function renderStars(): void {
    for (const [index, star] of stars.entries()) {
      const filled = index < rating;
      star.textContent = filled ? '★' : '☆';
      star.classList.toggle('rating__star--filled', filled);
      star.setAttribute('aria-checked', String(filled));
    }
  }

  for (let index = 0; index < STAR_COUNT; index += 1) {
    const star = el('button', {
      className: 'rating__star',
      testId: `rating-star-${String(index + 1)}`,
      text: '☆',
      attrs: {
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        'aria-label': `Оценка ${String(index + 1)} из 5`,
      },
    });

    star.addEventListener('click', () => {
      rating = index + 1;
      submit.disabled = false;
      renderStars();
    });

    stars.push(star);
  }

  return el('div', { className: 'popup-overlay', testId: 'rating-popup' }, [
    el(
      'div',
      { className: 'popup rating', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      [
        el('div', { className: 'popup__emoji', text: '🏆', attrs: { 'aria-hidden': 'true' } }),
        el('h3', { className: 'popup__title', text: 'Все уровни пройдены!' }),
        el('p', { className: 'popup__body', text: 'Оцени игру' }),
        el('div', { className: 'rating__stars', attrs: { role: 'radiogroup', 'aria-label': 'Оценка от 1 до 5' } }, stars),
        comment,
        submit,
      ],
    ),
  ]);
}
