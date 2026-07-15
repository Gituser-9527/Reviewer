declare namespace chrome {
  namespace runtime {
    const onMessage: { addListener(listener: (message: any, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void): void };
    function sendMessage(message: unknown): Promise<unknown>;
    function getURL(path: string): string;
  }
  namespace sidePanel { function setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>; }
  namespace tabs {
    function query(queryInfo: { active: boolean; lastFocusedWindow: boolean }): Promise<Array<{ id?: number }>>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }
  namespace scripting {
    function executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown>;
    function insertCSS(options: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  }
}
