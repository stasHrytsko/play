import { describe, expect, it, vi } from 'vitest';
import { NoopFeedbackSink } from '../../src/shell/feedback/FeedbackSink.ts';
import { Web3FormsFeedbackSink } from '../../src/shell/feedback/Web3FormsFeedbackSink.ts';

function okFetch(): typeof globalThis.fetch {
  return vi.fn(() => Promise.resolve(new Response('', { status: 200 })));
}

const FEEDBACK = { gameId: 'demo', gameTitle: 'Demo Game', comment: 'Слишком легко' };

describe('Web3FormsFeedbackSink', () => {
  it('posts the access key, game and comment to web3forms', async () => {
    const fetchMock = okFetch();
    await new Web3FormsFeedbackSink('test-key', fetchMock).send(FEEDBACK);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchMock).mock.calls[0] ?? [];
    expect(url).toBe('https://api.web3forms.com/submit');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body['access_key']).toBe('test-key');
    expect(body['game_id']).toBe('demo');
    expect(body['comment']).toBe('Слишком легко');
    expect(body['subject']).toContain('Demo Game');
  });

  it('resolves quietly when the network is gone', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(new Web3FormsFeedbackSink('test-key', failing).send(FEEDBACK)).resolves.toBeUndefined();
  });

  it('resolves quietly when web3forms answers with an error status', async () => {
    const failing = vi.fn(() =>
      Promise.resolve(new Response('nope', { status: 422 })),
    ) as unknown as typeof globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(new Web3FormsFeedbackSink('test-key', failing).send(FEEDBACK)).resolves.toBeUndefined();
  });
});

describe('NoopFeedbackSink', () => {
  it('records without sending', async () => {
    const sink = new NoopFeedbackSink();
    await sink.send(FEEDBACK);
    expect(sink.sent).toEqual([FEEDBACK]);
  });
});
