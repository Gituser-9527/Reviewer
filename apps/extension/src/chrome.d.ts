declare const chrome: {
  runtime: {
    id: string;
    lastError?: { message?: string };
    onMessage: { addListener(listener: (message: unknown, sender: { tab?: { id?: number; url?: string } }, respond: (response: unknown) => void) => boolean | void): void };
    sendMessage(message: unknown): Promise<unknown>;
  };
  tabs: {
    onActivated: { addListener(listener: (info: { tabId: number }) => void): void };
    onUpdated: { addListener(listener: (tabId: number, change: { status?: string }, tab: { url?: string }) => void): void };
    onRemoved: { addListener(listener: (tabId: number) => void): void };
    query(query: { active?: boolean; currentWindow?: boolean; lastFocusedWindow?: boolean }): Promise<Array<{ id?: number; url?: string; active?: boolean; lastAccessed?: number }>>;
    get(tabId: number): Promise<{ id?: number; url?: string; active?: boolean; lastAccessed?: number }>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  storage: {
    local: { get(keys?: string | string[] | null): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void>; remove(keys: string | string[]): Promise<void> };
    session: { get(keys?: string | string[] | null): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void> };
    onChanged: { addListener(listener: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: 'local' | 'session' | 'sync' | 'managed') => void): void };
  };
};
