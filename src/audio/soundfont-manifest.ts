// 由 npm run soundfonts 產生，不要手動修改。
// 記錄 public/soundfonts 裡每個樂器打包了哪些音，測試用它檢查配樂有沒有漏音。

export const BUNDLED_NOTES: Readonly<Record<string, readonly string[]>> = {
  cello: ['D2', 'F2', 'G2', 'A2', 'Bb2', 'C3', 'D3'],
  choir_aahs: ['C4', 'D4', 'E4', 'F4'],
  flute: ['F4', 'G4', 'A4', 'B4', 'C5', 'Db5', 'D5', 'E5', 'F5', 'G5', 'A5'],
  oboe: ['A4', 'Db5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'Db6', 'D6'],
  orchestral_harp: ['G3', 'A3', 'Bb3', 'B3', 'C4', 'Db4', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'D5'],
  pizzicato_strings: ['D3', 'E3', 'F3', 'G3', 'A3', 'Bb3', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4'],
  recorder: ['C5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6', 'D6'],
  string_ensemble_1: ['E3', 'F3', 'G3', 'A3'],
  timpani: ['D2', 'F2', 'G2', 'A2', 'Bb2'],
  tremolo_strings: ['Db4', 'D4', 'E4', 'F4', 'G4', 'A4'],
}
