/** Presentation labels only; IDs, groups and equipment rules stay in the catalog. */
const frameNames: Readonly<Record<string, string>> = {
  "attack-1": "攻撃型Ⅰ", "reactor-1": "反応炉型Ⅰ", "defense-1": "防御型Ⅰ", "mobile-1": "機動型Ⅰ",
  "attack-2-a": "攻撃型Ⅱ-A", "attack-2-b": "攻撃型Ⅱ-B", "reactor-2": "反応炉型Ⅱ", "defense-2": "防御型Ⅱ", "mobile-2": "機動型Ⅱ", "all-rounder": "万能型",
  "attack-2": "攻撃型Ⅱ（A/B）"
};
export function getRobotFrameName(id: string): string { return frameNames[id] ?? id; }
