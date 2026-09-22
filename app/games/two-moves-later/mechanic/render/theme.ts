import { readUiTheme } from '../../../../src/ui-kit/index.ts';
import type { TaxiColor } from '../engine/types.ts';

export interface ColorStyle {
  readonly fill: number;
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
  readonly glass: number;
  readonly glassDivider: number;
  readonly wheel: number;
  readonly skin: number;
  readonly timerBackground: number;
  readonly timerText: string;
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
    board: 0x4a5058,
    cell: 0x5a616a,
    empty: hex(ui.border),
    border: hex(ui.textMuted),
    text: ui.text,
    textDark: hex(ui.text),
    passengerRing: hex(ui.surfaceRaised),
    glass: 0xd8edf1,
    glassDivider: 0x536670,
    wheel: 0x242a31,
    skin: 0xe9b58e,
    timerBackground: hex(ui.text),
    timerText: ui.surfaceRaised,
    colors: {
      red: { fill: 0xe9685d },
      blue: { fill: 0x4f83d7 },
      yellow: { fill: 0xe2b53f },
    },
  };
}
