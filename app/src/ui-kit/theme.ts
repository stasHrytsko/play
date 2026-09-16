export interface UiTheme {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  blue: string;
  sage: string;
  mustard: string;
  rose: string;
  lavender: string;
}

const FALLBACK: UiTheme = {
  background: '#efefec',
  surface: '#f8f7f3',
  surfaceRaised: '#ffffff',
  border: '#d9d6cf',
  text: '#2f2f2f',
  textMuted: '#6f6f6b',
  accent: '#d9785f',
  accentHover: '#c96851',
  blue: '#7da7d9',
  sage: '#8fbb95',
  mustard: '#e0c16b',
  rose: '#df8ca0',
  lavender: '#b9a7d9',
};

export function readUiTheme(root: Element = document.documentElement): UiTheme {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;

  return {
    background: token('--bg', FALLBACK.background),
    surface: token('--surface', FALLBACK.surface),
    surfaceRaised: token('--surface-raised', FALLBACK.surfaceRaised),
    border: token('--border', FALLBACK.border),
    text: token('--text', FALLBACK.text),
    textMuted: token('--text-muted', FALLBACK.textMuted),
    accent: token('--accent', FALLBACK.accent),
    accentHover: token('--accent-hover', FALLBACK.accentHover),
    blue: token('--piece-blue', FALLBACK.blue),
    sage: token('--piece-sage', FALLBACK.sage),
    mustard: token('--piece-mustard', FALLBACK.mustard),
    rose: token('--piece-rose', FALLBACK.rose),
    lavender: token('--piece-lavender', FALLBACK.lavender),
  };
}
