export interface UiElementOptions {
  className?: string;
  text?: string;
  testId?: string;
  attrs?: Readonly<Record<string, string>>;
}

export function uiEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: UiElementOptions = {},
  children: readonly (Node | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.testId !== undefined) node.dataset['testid'] = options.testId;

  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(key, value);
  }

  for (const child of children) {
    if (child !== null) node.append(child);
  }

  return node;
}

export function setDisabled(node: HTMLButtonElement, disabled: boolean): void {
  node.disabled = disabled;
  node.setAttribute('aria-disabled', String(disabled));
}
