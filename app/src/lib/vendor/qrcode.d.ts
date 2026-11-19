// Types for the vendored qrcode-generator (MIT, Kazuhiko Arase; the same copy as /vendor/qrcode-generator on the web).
declare function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): {
  addData(data: string, mode?: 'Byte' | 'Numeric' | 'Alphanumeric' | 'Kanji'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
};
export = qrcode;
