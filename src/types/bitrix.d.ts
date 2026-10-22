export {};
declare global {
  interface Window {
    BX24?: {
      init(callback: () => void): void;
      fitWindow(callback?: () => void): void;
      installFinish(): void;
    };
  }
}
