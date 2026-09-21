/**
 * Bridge between the shared CSS/UI theme and the Phaser scene.
 *
 * The DOM shell and the canvas render through different stacks. readUiTheme()
 * stays the single token reader; this file converts its string colours into
 * numeric 0xRRGGBB for Phaser and pins each level colour id to one token.
 */
import type { GamePieceTone } from '../../../../src/ui-kit/index.ts';
import { readUiTheme } from '../../../../src/ui-kit/index.ts';

export interface ColorStyle {
  /** Fill for the screw head on the canvas. */
  readonly fill: number;
  /** ui-kit tone, so the pocket and the queue show the same colour as the plate. */
  readonly tone: GamePieceTone;
  /**
   * A distinct glyph per colour, drawn on the screw and shown on every box.
   *
   * The whole mechanic is colour matching, so colour alone would lock out a
   * colour-blind player completely. A second channel is not decoration here.
   * Deviation from spec §7, which describes plain round screws — flagged for
   * gate 4 rather than done quietly.
   */
  readonly glyph: string;
}

export interface SceneTheme {
  background: number;
  plate: number;
  screwStroke: number;
  screwShadow: number;
  glyphColor: string;
  colors: Readonly<Record<string, ColorStyle>>;
  fallback: ColorStyle;
}

const FALLBACK_HEX = 0x000000;

function hexToNumber(value: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (match?.[1] === undefined) return FALLBACK_HEX;
  return Number.parseInt(match[1], 16);
}

export function readTheme(root: Element = document.documentElement): SceneTheme {
  const ui = readUiTheme(root);

  const colors: Record<string, ColorStyle> = {
    c1: { fill: hexToNumber(ui.blue), tone: 'blue', glyph: '●' },
    c2: { fill: hexToNumber(ui.sage), tone: 'sage', glyph: '▲' },
    c3: { fill: hexToNumber(ui.mustard), tone: 'mustard', glyph: '■' },
    c4: { fill: hexToNumber(ui.rose), tone: 'rose', glyph: '◆' },
    c5: { fill: hexToNumber(ui.lavender), tone: 'lavender', glyph: '★' },
  };

  return {
    background: hexToNumber(ui.surface),
    plate: hexToNumber(ui.surfaceRaised),
    screwStroke: hexToNumber(ui.text),
    screwShadow: hexToNumber(ui.text),
    glyphColor: ui.background,
    colors,
    fallback: { fill: hexToNumber(ui.accent), tone: 'neutral', glyph: '◇' },
  };
}

export function styleFor(theme: SceneTheme, color: string): ColorStyle {
  return theme.colors[color] ?? theme.fallback;
}
