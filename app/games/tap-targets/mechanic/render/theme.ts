/**
 * Bridge between the shared CSS/UI theme and the Phaser scene.
 *
 * The DOM shell and the canvas render through different stacks. readUiTheme()
 * remains the single token reader; this file only converts its string colours
 * into numeric 0xRRGGBB values for Phaser.
 */
import { readUiTheme } from '../../../../src/ui-kit/index.ts';

export interface SceneTheme {
  background: number;
  targetPalette: readonly number[];
  targetStroke: number;
  targetShadow: number;
  targetHighlight: number;
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
    targetPalette: [
      hexToNumber(ui.blue),
      hexToNumber(ui.sage),
      hexToNumber(ui.mustard),
      hexToNumber(ui.rose),
      hexToNumber(ui.lavender),
      hexToNumber(ui.accent),
    ],
    targetStroke: hexToNumber(ui.text),
    targetShadow: hexToNumber(ui.text),
    targetHighlight: 0xffffff,
    text: ui.textMuted,
  };
}
