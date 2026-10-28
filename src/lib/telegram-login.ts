import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as oidc from 'openid-client';

export const TELEGRAM_FLOW_COOKIE = 'tgmon_telegram_flow';
export const TELEGRAM_LINK_COOKIE = 'tgmon_telegram_link';
export const TELEGRAM_FLOW_SECONDS = 10 * 60;

export interface TelegramProfile {
  sub: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
}

export interface TelegramFlow {
  state: string;
  nonce: string;
  verifier: string;
  mode: 'login' | 'link';
  userId: number | null;
  expiresAt: number;
}

export interface TelegramLinkProof {
  profile: TelegramProfile;
  userId: number;
  expiresAt: number;
}

let cachedConfig: Promise<oidc.Configuration> | null = null;

export function telegramLoginConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_LOGIN_CLIENT_ID && process.env.TELEGRAM_LOGIN_CLIENT_SECRET
    && process.env.TELEGRAM_LOGIN_REDIRECT_URI);
}

export function telegramAppUrl(path: string, requestUrl: string): URL {
  return new URL(path, process.env.TELEGRAM_LOGIN_REDIRECT_URI || requestUrl);
}

function redirectUri(): string {
  const value = process.env.TELEGRAM_LOGIN_REDIRECT_URI;
  if (!value) throw new Error('Telegram Login redirect URI is not configured');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
    throw new Error('Telegram Login redirect URI must use HTTPS');
  }
  return url.toString();
}

async function config(): Promise<oidc.Configuration> {
  if (!telegramLoginConfigured()) throw new Error('Telegram Login is not configured');
  if (!cachedConfig) {
    cachedConfig = oidc.discovery(
      new URL('https://oauth.telegram.org'),
      process.env.TELEGRAM_LOGIN_CLIENT_ID!,
      { client_secret: process.env.TELEGRAM_LOGIN_CLIENT_SECRET! },
      oidc.ClientSecretBasic(process.env.TELEGRAM_LOGIN_CLIENT_SECRET!),
      { timeout: 10 },
    ).then(value => {
      oidc.enableNonRepudiationChecks(value);
      return value;
    }).catch(error => {
      cachedConfig = null;
      throw error;
    });
  }
  return cachedConfig;
}

function sign(value: string, purpose: string): string {
  const key = process.env.COLLECT_API_TOKEN;
  if (!key) throw new Error('Session signing key is not configured');
  return createHmac('sha256', key).update(`${purpose}:${value}`).digest('base64url');
}

export function encodeTelegramCookie<T>(payload: T, purpose: 'flow' | 'link'): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, purpose)}`;
}

export function isTelegramFlow(value: unknown): value is TelegramFlow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const flow = value as Record<string, unknown>;
  return typeof flow.state === 'string' && flow.state.length > 0 && flow.state.length <= 256
    && typeof flow.nonce === 'string' && flow.nonce.length > 0 && flow.nonce.length <= 256
    && typeof flow.verifier === 'string' && flow.verifier.length > 0 && flow.verifier.length <= 256
    && (flow.mode === 'login' || flow.mode === 'link')
    && (flow.userId === null || (typeof flow.userId === 'number' && Number.isSafeInteger(flow.userId) && flow.userId > 0))
    && (flow.mode !== 'link' || flow.userId !== null)
    && typeof flow.expiresAt === 'number' && flow.expiresAt > Date.now();
}

export function isTelegramLinkProof(value: unknown): value is TelegramLinkProof {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proof = value as Record<string, unknown>;
  if (!Number.isSafeInteger(proof.userId) || Number(proof.userId) <= 0
    || typeof proof.expiresAt !== 'number' || proof.expiresAt <= Date.now()
    || !proof.profile || typeof proof.profile !== 'object' || Array.isArray(proof.profile)) return false;
  const profile = proof.profile as Record<string, unknown>;
  return typeof profile.sub === 'string' && profile.sub.length > 0 && profile.sub.length <= 255
    && (profile.name === null || (typeof profile.name === 'string' && profile.name.length <= 120))
    && (profile.username === null || (typeof profile.username === 'string' && profile.username.length <= 64))
    && (profile.photoUrl === null || (typeof profile.photoUrl === 'string'
      && profile.photoUrl.length <= 1000 && profile.photoUrl.startsWith('https://')));
}

export function decodeTelegramCookie<T>(raw: string | undefined, purpose: 'flow' | 'link',
  validate: (value: unknown) => value is T): T | null {
  if (!raw || raw.length > 4096) return null;
  const [data, signature, extra] = raw.split('.');
  if (!data || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(data)) return null;
  try {
    const expected = Buffer.from(sign(data, purpose), 'base64url');
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const parsed: unknown = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function createTelegramFlow(mode: TelegramFlow['mode'], userId: number | null): Promise<{ flow: TelegramFlow; authorizationUrl: URL }> {
  const flow: TelegramFlow = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verifier: oidc.randomPKCECodeVerifier(),
    mode,
    userId,
    expiresAt: Date.now() + TELEGRAM_FLOW_SECONDS * 1000,
  };
  const authorizationUrl = oidc.buildAuthorizationUrl(await config(), new URLSearchParams({
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: 'S256',
  }));
  return { flow, authorizationUrl };
}

export async function exchangeTelegramCode(callbackUrl: URL, flow: TelegramFlow): Promise<TelegramProfile> {
  const callback = new URL(redirectUri());
  callback.search = callbackUrl.search;
  const tokens = await oidc.authorizationCodeGrant(await config(), callback, {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  }, { client_id: process.env.TELEGRAM_LOGIN_CLIENT_ID! });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('Telegram did not return an account identifier');
  }
  return {
    sub: claims.sub,
    name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : null,
    username: typeof claims.preferred_username === 'string' ? claims.preferred_username.slice(0, 64) : null,
    photoUrl: typeof claims.picture === 'string' && claims.picture.startsWith('https://')
      ? claims.picture.slice(0, 1000) : null,
  };
}

export function internalTelegramUsername(sub: string): string {
  return `tg_${createHash('sha256').update(sub).digest('hex').slice(0, 24)}`;
}
