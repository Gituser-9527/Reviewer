import type { WebJobCapture } from '@job-compliance/shared';

export type ExtensionMessage =
  | { type: 'WEB_CAPTURE_READ_CURRENT_PAGE' }
  | { type: 'WEB_CAPTURE_PAGE_SNAPSHOT'; payload: PageSnapshot }
  | { type: 'WEB_CAPTURE_HIGHLIGHT'; locators: Array<{ selector?: string; textQuote?: string }> }
  | { type: 'WEB_CAPTURE_CLEAR_HIGHLIGHTS' };

export interface PageSnapshot {
  pageUrl: string;
  pageTitle: string;
  mainText: string;
  jsonLdTexts: string[];
  embeddedJsonTexts: string[];
}

export interface CapturePreviewResponse {
  capture: WebJobCapture;
}
