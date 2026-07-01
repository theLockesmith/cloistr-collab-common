/**
 * @fileoverview Tests for the NIP-46 decrypt fallback and the client-initiated
 * nostrconnect:// login flow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateSecretKey, getPublicKey, nip44, nip04, type Event } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { decryptNip46Content, startNostrConnect } from './nip46.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * An in-memory Nostr relay + signer for exercising the full nostrconnect ->
 * connectNip46 handshake with real crypto and event routing (no network).
 */
class MockRelay {
  subs: { ws: MockWebSocket; subId: string; filter: Record<string, unknown> }[] = [];
  signerSK: Uint8Array | null = null;
  signerPub = '';

  setSigner(sk: Uint8Array) {
    this.signerSK = sk;
    this.signerPub = getPublicKey(sk);
  }

  subscribe(ws: MockWebSocket, subId: string, filter: Record<string, unknown>) {
    this.subs.push({ ws, subId, filter });
  }

  private pTags(event: Event): string[] {
    return event.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
  }

  private matches(filter: Record<string, unknown>, event: Event): boolean {
    const kinds = filter.kinds as number[] | undefined;
    if (kinds && !kinds.includes(event.kind)) return false;
    const authors = filter.authors as string[] | undefined;
    if (authors && !authors.includes(event.pubkey)) return false;
    const p = filter['#p'] as string[] | undefined;
    if (p && !p.some((pk) => this.pTags(event).includes(pk))) return false;
    return true;
  }

  private deliver(event: Event) {
    for (const s of this.subs) {
      if (this.matches(s.filter, event)) s.ws._deliver(s.subId, event);
    }
  }

  /** Called when a client socket publishes an EVENT. */
  publish(event: Event) {
    // Deliver to subscribers, and if it's addressed to the signer, respond.
    setTimeout(() => this.deliver(event), 0);
    if (this.signerSK && event.kind === 24133 && this.pTags(event).includes(this.signerPub)) {
      setTimeout(() => void this.signerRespond(event), 0);
    }
  }

  /** Signer approves a nostrconnect:// URI by echoing the secret (NIP-44). */
  sendAck(clientPubkey: string, secret: string) {
    const convKey = nip44.getConversationKey(this.signerSK!, clientPubkey);
    const content = nip44.encrypt(JSON.stringify({ id: secret, result: secret }), convKey);
    this.deliver(this.makeEvent(clientPubkey, content));
  }

  private makeEvent(clientPubkey: string, content: string): Event {
    return {
      kind: 24133,
      pubkey: this.signerPub,
      content,
      tags: [['p', clientPubkey]],
      created_at: 0,
      id: `evt-${Math.floor(performance.now() * 1000)}`,
      sig: '',
    } as Event;
  }

  private async signerRespond(reqEvent: Event) {
    // Requests come in NIP-04 (from the client); try NIP-44 then NIP-04.
    let decrypted: string;
    try {
      const ck = nip44.getConversationKey(this.signerSK!, reqEvent.pubkey);
      decrypted = nip44.decrypt(reqEvent.content, ck);
    } catch {
      decrypted = await nip04.decrypt(this.signerSK!, reqEvent.pubkey, reqEvent.content);
    }
    const req = JSON.parse(decrypted) as { id: string; method: string };
    const result = req.method === 'get_public_key' ? this.signerPub : 'ack';
    // Respond with NIP-44 — exercises the client's decrypt fallback.
    const ck = nip44.getConversationKey(this.signerSK!, reqEvent.pubkey);
    const content = nip44.encrypt(JSON.stringify({ id: req.id, result }), ck);
    this.deliver(this.makeEvent(reqEvent.pubkey, content));
  }
}

/**
 * WebSocket stand-in. In manual mode (default) the test drives the lifecycle via
 * _open()/_emitEvent(). In relay mode (autoOpen + relay set) it opens itself and
 * routes frames through the MockRelay so internally-created sockets work too.
 */
class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  static autoOpen = false;
  static relay: MockRelay | null = null;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    if (MockWebSocket.autoOpen) {
      setTimeout(() => {
        if (!this.closed) {
          this.readyState = MockWebSocket.OPEN;
          this.onopen?.();
        }
      }, 0);
    }
  }

  send(data: string) {
    this.sent.push(data);
    const relay = MockWebSocket.relay;
    if (!relay) return;
    const m = JSON.parse(data);
    if (m[0] === 'REQ') relay.subscribe(this, m[1], m[2]);
    else if (m[0] === 'EVENT') relay.publish(m[1]);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }

  _open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  _emitEvent(subId: string, event: unknown) {
    this._deliver(subId, event);
  }

  _deliver(subId: string, event: unknown) {
    this.onmessage?.({ data: JSON.stringify(['EVENT', subId, event]) });
  }
}

function parseQuery(uri: string): URLSearchParams {
  return new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
}

describe('decryptNip46Content', () => {
  it('decrypts NIP-44 — the scheme the signer and nostrconnect ack use', async () => {
    const signerSK = generateSecretKey();
    const clientSK = generateSecretKey();
    const clientPub = getPublicKey(clientSK);
    const signerPub = getPublicKey(signerSK);

    const payload = JSON.stringify({ id: 'abc', result: 'ok' });
    const convKey = nip44.getConversationKey(signerSK, clientPub);
    const ciphertext = nip44.encrypt(payload, convKey);

    // This is the regression that broke login: the client must read NIP-44.
    expect(await decryptNip46Content(clientSK, signerPub, ciphertext)).toBe(payload);
  });

  it('falls back to NIP-04 for legacy responses', async () => {
    const signerSK = generateSecretKey();
    const clientSK = generateSecretKey();
    const clientPub = getPublicKey(clientSK);
    const signerPub = getPublicKey(signerSK);

    const payload = JSON.stringify({ id: 'abc', result: 'ok' });
    const ciphertext = await nip04.encrypt(signerSK, clientPub, payload);

    expect(await decryptNip46Content(clientSK, signerPub, ciphertext)).toBe(payload);
  });

  it('throws citing both schemes when content is undecryptable', async () => {
    const clientSK = generateSecretKey();
    const signerPub = getPublicKey(generateSecretKey());
    await expect(
      decryptNip46Content(clientSK, signerPub, 'not-valid-ciphertext')
    ).rejects.toThrow(/nip44:.*nip04:/);
  });
});

describe('startNostrConnect', () => {
  let originalWS: unknown;

  beforeEach(() => {
    originalWS = (globalThis as unknown as { WebSocket: unknown }).WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    MockWebSocket.autoOpen = false;
    MockWebSocket.relay = null;
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWS;
  });

  it('builds a nostrconnect:// URI from the client key and params', () => {
    const clientSK = bytesToHex(generateSecretKey());
    const session = startNostrConnect({
      clientSecretKey: clientSK,
      appName: 'Test App',
      appUrl: 'https://app.test',
      relayUrls: ['wss://relay.cloistr.xyz'],
    });

    expect(session.clientPubkey).toBe(getPublicKey(hexToBytes(clientSK)));
    expect(session.uri.startsWith(`nostrconnect://${session.clientPubkey}?`)).toBe(true);

    const q = parseQuery(session.uri);
    expect(q.get('relay')).toBe('wss://relay.cloistr.xyz');
    expect(q.get('secret')).toBe(session.secret);
    expect(q.get('name')).toBe('Test App');
    expect(q.get('url')).toBe('https://app.test');

    session.cancel();
  });

  it('subscribes for kind:24133 responses addressed to the client pubkey', () => {
    const session = startNostrConnect({ relayUrls: ['wss://relay.cloistr.xyz'] });
    const ws = MockWebSocket.instances[0];
    ws._open();

    expect(ws.sent).toHaveLength(1);
    const req = JSON.parse(ws.sent[0]);
    expect(req[0]).toBe('REQ');
    expect(req[2].kinds).toEqual([24133]);
    expect(req[2]['#p']).toEqual([session.clientPubkey]);

    session.cancel();
  });

  it('ignores an ack whose secret does not match, then times out', async () => {
    const session = startNostrConnect({ relayUrls: ['wss://relay.cloistr.xyz'], timeoutMs: 150 });
    const ws = MockWebSocket.instances[0];
    ws._open();

    const signerSK = generateSecretKey();
    const signerPub = getPublicKey(signerSK);
    const convKey = nip44.getConversationKey(signerSK, session.clientPubkey);
    const content = nip44.encrypt(JSON.stringify({ id: 'x', result: 'WRONG-SECRET' }), convKey);
    ws._emitEvent('sub', {
      kind: 24133,
      pubkey: signerPub,
      content,
      tags: [['p', session.clientPubkey]],
      created_at: 0,
      id: 'evt',
      sig: '',
    });

    await expect(session.approved).rejects.toThrow(/timed out/);
  });

  it('cancel() closes the listener socket', () => {
    const session = startNostrConnect({ relayUrls: ['wss://relay.cloistr.xyz'] });
    const ws = MockWebSocket.instances[0];
    session.cancel();
    expect(ws.closed).toBe(true);
  });

  it('resolves with a connected signer when the ack secret matches', async () => {
    MockWebSocket.autoOpen = true;
    const relay = new MockRelay();
    relay.setSigner(generateSecretKey());
    MockWebSocket.relay = relay;

    const session = startNostrConnect({ relayUrls: ['wss://relay.cloistr.xyz'], timeoutMs: 3000 });

    // Let the listener socket open + subscribe, then the signer approves.
    await tick();
    relay.sendAck(session.clientPubkey, session.secret);

    const signer = await session.approved;
    // The signer's own key (the user identity) comes back via get_public_key.
    expect(await signer.getPublicKey()).toBe(relay.signerPub);
  });
});
