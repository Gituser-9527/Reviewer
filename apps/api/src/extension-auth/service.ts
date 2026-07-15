import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthContext } from '../auth/service.js';

export const extensionScopes = ['web_capture:create', 'web_capture:read', 'web_capture:correct', 'audit:create', 'audit:read', 'feedback:create'] as const;
export type ExtensionScope = (typeof extensionScopes)[number];
type Code = { clientId: string; context: AuthContext; scopes: ExtensionScope[]; expiresAt: number; used: boolean };
type Token = { authorizationId: string; context: AuthContext; scopes: ExtensionScope[]; expiresAt: number; revoked: boolean };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

/** In-memory credential issuer for the current header-auth development identity. Replace storage with the authorization repository in production. */
export class ExtensionAuthService {
  private readonly codes = new Map<string, Code>(); private readonly tokens = new Map<string, Token>();
  authorize(context: AuthContext, clientId: string, scopes: ExtensionScope[]): { authorizationCode: string; expiresAt: string } {
    const authorizationCode = secret(); const expiresAt = Date.now() + 5 * 60_000;
    this.codes.set(digest(authorizationCode), { clientId, context, scopes, expiresAt, used: false });
    return { authorizationCode, expiresAt: new Date(expiresAt).toISOString() };
  }
  exchange(clientId: string, authorizationCode: string): { accessToken: string; refreshToken: string; expiresAt: string; scopes: ExtensionScope[] } {
    const code = this.codes.get(digest(authorizationCode));
    if (!code || code.used || code.clientId !== clientId || code.expiresAt <= Date.now()) throw new ExtensionAuthError('EXTENSION_NOT_AUTHENTICATED');
    code.used = true; const authorizationId = `extension_auth_${randomUUID()}`; const expiresAt = Date.now() + 15 * 60_000; const accessToken = secret(); const refreshToken = secret();
    this.tokens.set(digest(accessToken), { authorizationId, context: code.context, scopes: code.scopes, expiresAt, revoked: false });
    this.tokens.set(digest(refreshToken), { authorizationId, context: code.context, scopes: code.scopes, expiresAt: Date.now() + 24 * 60 * 60_000, revoked: false });
    return { accessToken, refreshToken, expiresAt: new Date(expiresAt).toISOString(), scopes: code.scopes };
  }
  authenticate(accessToken: string, scope: ExtensionScope): Token {
    const token = this.tokens.get(digest(accessToken));
    if (!token || token.revoked) throw new ExtensionAuthError('EXTENSION_NOT_AUTHENTICATED');
    if (token.expiresAt <= Date.now()) throw new ExtensionAuthError('EXTENSION_TOKEN_EXPIRED');
    if (!token.scopes.includes(scope)) throw new ExtensionAuthError('EXTENSION_SCOPE_DENIED');
    return token;
  }
  revoke(accessToken: string): void { const token = this.tokens.get(digest(accessToken)); if (token) [...this.tokens.values()].filter((item) => item.authorizationId === token.authorizationId).forEach((item) => { item.revoked = true; }); }
}
export class ExtensionAuthError extends Error { constructor(readonly code: 'EXTENSION_NOT_AUTHENTICATED' | 'EXTENSION_TOKEN_EXPIRED' | 'EXTENSION_SCOPE_DENIED') { super(code); } }
