/**
 * Bridge between the CSS design tokens and the Phaser scene.
 *
 * The DOM shell and the canvas render through completely different stacks; the
 * only way to stop them drifting apart visually is to make src/styles/tokens.css
 * the single source and have the canvas read it at runtime.
 */
export interface SceneTheme {
  background: number;
  targetPalette: readonly number[];
  targetStroke: number;
  targetShadow: number;
  targetHighlight: number;
  text: string;
}

const FALLBACK: SceneTheme = {
  background: 0xf8f7f3,
  targetPalette: [0x7da7d9, 0x8fbb95, 0xe0c16b, 0xdf8ca0, 0xb9a7d9, 0xd9785f],
  targetStroke: 0x2f2f2f,
  targetShadow: 0x2f2f2f,
  targetHighlight: 0xffffff,
  text: '#6f6f6b',
};

function hexToNumber(value: string, fallback: number): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (match?.[1] === undefined) return fallback;
  return Number.parseInt(match[1], 16);
}

export function readTheme(root: Element = document.documentElement): SceneTheme {
  const styles = getComputedStyle(root);
  const token = (name: string): string => styles.getPropertyValue(name);

  return {
    background: hexToNumber(token('--surface-soft'), FALLBACK.background),
    targetPalette: [
      hexToNumber(token('--piece-blue'), FALLBACK.targetPalette[0] ?? 0x7da7d9),
      hexToNumber(token('--piece-sage'), FALLBACK.targetPalette[1] ?? 0x8fbb95),
      hexToNumber(token('--piece-mustard'), FALLBACK.targetPalette[2] ?? 0xe0c16b),
      hexToNumber(token('--piece-rose'), FALLBACK.targetPalette[3] ?? 0xdf8ca0),
      hexToNumber(token('--piece-lavender'), FALLBACK.targetPalette[4] ?? 0xb9a7d9),
      hexToNumber(token('--accent'), FALLBACK.targetPalette[5] ?? 0xd9785f),
    ],
    targetStroke: hexToNumber(token('--text'), FALLBACK.targetStroke),
    targetShadow: hexToNumber(token('--text'), FALLBACK.targetShadow),
    targetHighlight: FALLBACK.targetHighlight,
    text: token('--text-muted').trim() || FALLBACK.text,
  };
}
