import type { Event, Relay, VerifiedEvent } from 'nostr-tools';

export const PUBLISH_TIMEOUT_MS = 15_000;
export const AUTH_TIMEOUT_MS = 10_000;

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
