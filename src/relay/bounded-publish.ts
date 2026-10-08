import type { Event, EventTemplate, Relay, VerifiedEvent } from 'nostr-tools';

export const PUBLISH_TIMEOUT_MS = 15_000;
export const AUTH_TIMEOUT_MS = 10_000;

export interface PoolPublishResult {
  accepted: string[];
  rejected: { relay: string; reason: string }[];
  timedOut: string[];
}

export interface PublishablePool {
  publish(
    relays: string[],
    event: Event,
    params?: {
      onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
      maxWait?: number;
      abort?: AbortSignal;
    }
  ): Promise<string>[];
}

export class PublishTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`publish timed out after ${timeoutMs}ms (possible auth hang)`);
    this.name = 'PublishTimeoutError';
  }
}

export class AuthSignerError extends Error {
  constructor(reason?: string) {
    super(
      `NIP-42 authentication failed: ${reason || 'the signer refused to sign the auth event'}`
    );
    this.name = 'AuthSignerError';
  }
}

export async function boundedPublish(
  relay: Relay,
  event: Event,
  timeoutMs = PUBLISH_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  await Promise.race([
    relay.publish(event),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PublishTimeoutError(timeoutMs)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer!));
}

export async function boundedAuth(
  relay: Relay,
  callback: (authEvent: any) => Promise<VerifiedEvent>,
  timeoutMs = AUTH_TIMEOUT_MS
): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      relay.auth(callback),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AuthSignerError('timed out waiting for the signer')),
          timeoutMs
        );
      }),
    ]).finally(() => clearTimeout(timer!));
  } catch (e) {
    if (e instanceof AuthSignerError) throw e;
    throw new AuthSignerError(e instanceof Error ? e.message : String(e));
  }
}

// ── Pool-level bounded publish ─────────────────────────────────────────────

export function boundedPoolPublish(
  pool: PublishablePool,
  relays: string[],
  event: Event,
  options?: {
    onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
    timeoutMs?: number;
    authTimeoutMs?: number;
  }
): Promise<string>[] {
  const timeoutMs = options?.timeoutMs ?? PUBLISH_TIMEOUT_MS;
  const authTimeoutMs = options?.authTimeoutMs ?? AUTH_TIMEOUT_MS;

  const boundedOnauth = options?.onauth
    ? async (evt: EventTemplate): Promise<VerifiedEvent> => {
        let timer: ReturnType<typeof setTimeout>;
        try {
          return await Promise.race([
            options.onauth!(evt),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new AuthSignerError('timed out waiting for the signer')),
                authTimeoutMs
              );
            }),
          ]).finally(() => clearTimeout(timer!));
        } catch (e) {
          if (e instanceof AuthSignerError) throw e;
          throw new AuthSignerError(e instanceof Error ? e.message : String(e));
        }
      }
    : undefined;

  const perRelay = pool.publish(relays, event, { onauth: boundedOnauth });

  return perRelay.map(p => {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PublishTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer!));
  });
}

export async function settlePoolPublish(
  relays: string[],
  promises: Promise<string>[]
): Promise<PoolPublishResult> {
  const results = await Promise.allSettled(promises);
  const accepted: string[] = [];
  const rejected: { relay: string; reason: string }[] = [];
  const timedOut: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const url = relays[i] ?? 'unknown';
    const result = results[i];
    if (result.status === 'fulfilled') {
      accepted.push(url);
    } else {
      const reason = result.reason;
      if (reason instanceof PublishTimeoutError) {
        timedOut.push(url);
      } else {
        rejected.push({
          relay: url,
          reason: reason instanceof Error ? reason.message : String(reason),
        });
      }
    }
  }

  return { accepted, rejected, timedOut };
}
