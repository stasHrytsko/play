import { readUiTheme } from '../../../../src/ui-kit/index.ts';
import type { TaxiColor } from '../engine/types.ts';

export interface ColorStyle {
  readonly fill: number;
  readonly glyph: string;
}

export interface SceneTheme {
  readonly background: number;
  readonly board: number;
  readonly cell: number;
  readonly empty: number;
  readonly border: number;
  readonly text: string;
  readonly textDark: number;
  readonly passengerRing: number;
  readonly colors: Readonly<Record<TaxiColor, ColorStyle>>;
}

function hex(value: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match?.[1] === undefined ? 0x000000 : Number.parseInt(match[1], 16);
}

export function readTheme(root: Element = document.documentElement): SceneTheme {
  const ui = readUiTheme(root);
  return {
    background: hex(ui.surface),
    board: hex(ui.surfaceRaised),
    cell: hex(ui.background),
    empty: hex(ui.border),
    border: hex(ui.textMuted),
    text: ui.text,
    textDark: hex(ui.text),
    passengerRing: hex(ui.surfaceRaised),
    colors: {
      red: { fill: hex(ui.rose), glyph: '●' },
      blue: { fill: hex(ui.blue), glyph: '■' },
      yellow: { fill: hex(ui.mustard), glyph: '▲' },
    },
  };
}
