import type { TaxiColor } from '../engine/types.ts';

export interface ColorStyle {
  readonly fill: number;
  /** Darker bottom edge that gives the taxi tile its depth. */
  readonly edge: number;
}

export interface SceneTheme {
  readonly background: number;
  readonly frame: number;
  readonly gridLine: number;
  readonly cell: number;
  readonly empty: number;
  readonly emptyDot: number;
  readonly shadow: number;
  readonly pill: number;
  readonly badgeRing: number;
  readonly badgeText: string;
  /** Last-swipe warning and the timeout moment. */
  readonly danger: number;
  readonly colors: Readonly<Record<TaxiColor, ColorStyle>>;
}

// Taxi Slide paints its own light board straight from the §7.1 mockup
// (specs/screens/02-two-moves-later.png) rather than from shared tokens.
export function readTheme(): SceneTheme {
  return {
    background: 0xf6f7fa,
    frame: 0xe3e7ee,
    gridLine: 0xe6e9ef,
    cell: 0xfbfbfc,
    empty: 0xeef0f4,
    emptyDot: 0xc9ced7,
    shadow: 0x1f2a3d,
    pill: 0xffffff,
    badgeRing: 0xffffff,
    badgeText: '#ffffff',
    danger: 0xe0403c,
    colors: {
      red: { fill: 0xef6461, edge: 0xd9504d },
      blue: { fill: 0x5b8def, edge: 0x4574d6 },
      yellow: { fill: 0xebb93b, edge: 0xd6a22a },
    },
  };
}
