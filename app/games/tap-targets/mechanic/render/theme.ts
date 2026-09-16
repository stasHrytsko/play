/**
 * Bridge between the CSS design tokens and the Phaser scene.
 *
 * The DOM shell and the canvas render through completely different stacks; the
 * only way to stop them drifting apart visually is to make src/styles/tokens.css
 * the single source and have the canvas read it at runtime.
 *
 * The reading itself is not reimplemented here — src/ui-kit/theme.ts already
 * does it (readUiTheme), and every DOM component in the shell now goes through
 * that same function. This file's only job is the part ui-kit can't do:
 * turning a CSS colour string into the numeric 0xRRGGBB Phaser wants.
 */
import { readUiTheme } from '../../../../src/ui-kit/index.ts';

export interface SceneTheme {
  background: number;
  target: number;
  targetStroke: number;
  cleared: number;
  text: string;
}

const FALLBACK_HEX = 0x000000;

function hexToNumber(value: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (match?.[1] === undefined) return FALLBACK_HEX;
  return Number.parseInt(match[1], 16);
}

export function readTheme(root: Element = document.documentElement): SceneTheme {
  const ui = readUiTheme(root);

  return {
    background: hexToNumber(ui.surface),
    target: hexToNumber(ui.accent),
    targetStroke: hexToNumber(ui.accentHover),
    cleared: hexToNumber(ui.border),
    text: ui.textMuted,
  };
}
