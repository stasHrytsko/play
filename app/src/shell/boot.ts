import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { GameDefinition } from '../game-definition.ts';
import type { MechanicHost } from '../shell-contract.ts';
import '../styles/shell.css';
import '../styles/tokens.css';
import { ShellApp } from './App.ts';
import type { FeedbackSink } from './feedback/FeedbackSink.ts';
import { Web3FormsFeedbackSink } from './feedback/Web3FormsFeedbackSink.ts';
import { PreferencesProgressRepository } from './progress/PreferencesProgressRepository.ts';
import { PostHogSignalSink } from './signal/PostHogSignalSink.ts';
import type { SignalSink } from './signal/SignalSink.ts';

/**
 * Composition root, shared by every game (docs/decisions.md, 2026-09-16 —
 * shell is common, only games/<slug>/mechanic differs). This is the only
 * function that knows every concrete implementation exists; each
 * games/<slug>/main.ts is a few lines that call it with just that game's
 * config and mechanic. Swapping PostHog or Web3Forms for something else is a
 * change here and nowhere else.
 */
export async function bootShell(game: GameDefinition, mechanic: MechanicHost): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Missing #app element in index.html.');
  }

  document.title = game.title;

  const signal: SignalSink = new PostHogSignalSink({
    projectToken: game.analytics.postHogProjectToken,
    host: game.analytics.postHogHost,
  });

  const feedback: FeedbackSink = new Web3FormsFeedbackSink(game.feedback.web3formsAccessKey);

  const app = await ShellApp.create({
    root,
    game,
    progress: new PreferencesProgressRepository(game.id),
    signal,
    feedback,
    mechanic,
  });

  app.start();

  if (Capacitor.isNativePlatform()) {
    // Android hardware back. Only relevant once a winner is packaged for
    // phase 2 (docs/decisions.md, 2026-09-16: Capacitor is out of the default
    // daily path). A harmless no-op on web — isNativePlatform() is false.
    void CapacitorApp.addListener('backButton', () => {
      if (!app.handleBack()) {
        void CapacitorApp.exitApp();
      }
    });
  }
}
