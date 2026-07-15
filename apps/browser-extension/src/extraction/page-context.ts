import type { PageContext } from '@job-compliance/shared';
import type { PageSnapshot } from '../messaging/protocol.js';

const parseBlocks = (texts: string[]): unknown[] => texts.flatMap((text) => { try { return [JSON.parse(text) as unknown]; } catch { return []; } });

export function toPageContext(snapshot: PageSnapshot): PageContext {
  return { url: snapshot.pageUrl, title: snapshot.pageTitle, mainText: snapshot.mainText, jsonLdBlocks: parseBlocks(snapshot.jsonLdTexts), embeddedJsonBlocks: parseBlocks(snapshot.embeddedJsonTexts) };
}
