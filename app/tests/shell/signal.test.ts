import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const capture = vi.fn();

vi.mock('posthog-js', () => ({
  default: { init, capture },
}));

// Imported after the mock so PostHogSignalSink picks up the mocked module.
const { PostHogSignalSink } = await import('../../src/shell/signal/PostHogSignalSink.ts');
const { NoopSignalSink } = await import('../../src/shell/signal/SignalSink.ts');

const OPTIONS = { projectToken: 'phc_test', host: 'https://eu.i.posthog.com' };

beforeEach(() => {
  init.mockClear();
  capture.mockClear();
});

describe('PostHogSignalSink', () => {
  it('initialises once, lazily, on the first send', async () => {
    const sink = new PostHogSignalSink(OPTIONS);
    expect(init).not.toHaveBeenCalled();

    await sink.send({ event: 'game_open', gameId: 'demo' });
    await sink.send({ event: 'game_open', gameId: 'demo' });

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://eu.i.posthog.com' }),
    );
  });

  it('captures the event name with game_id and every extra property', async () => {
    const sink = new PostHogSignalSink(OPTIONS);
    await sink.send({ event: 'rating_submit', gameId: 'demo', rating: 4, version: 2 });

    expect(capture).toHaveBeenCalledWith('rating_submit', { game_id: 'demo', rating: 4, version: 2 });
  });

  it('never sends anonymous_user_id, session_id or a timestamp of its own', async () => {
    const sink = new PostHogSignalSink(OPTIONS);
    await sink.send({ event: 'level_start', gameId: 'demo', level: 0 });

    const properties = capture.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(properties).not.toHaveProperty('anonymous_user_id');
    expect(properties).not.toHaveProperty('session_id');
    expect(properties).not.toHaveProperty('timestamp');
  });

  it('resolves quietly when posthog throws', async () => {
    capture.mockImplementationOnce(() => {
      throw new Error('posthog unreachable');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const sink = new PostHogSignalSink(OPTIONS);
    await expect(sink.send({ event: 'game_open', gameId: 'demo' })).resolves.toBeUndefined();
  });
});

describe('NoopSignalSink', () => {
  it('records without sending', async () => {
    const sink = new NoopSignalSink();
    await sink.send({ event: 'game_open', gameId: 'demo' });
    expect(sink.sent).toEqual([{ event: 'game_open', gameId: 'demo' }]);
  });
});
