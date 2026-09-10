export interface LootTemplate {
  name: string
  weight: number
  value: number
}

export const LOOT: readonly LootTemplate[] = [
  { name: '深淵苔石', weight: 2, value: 40 },
  { name: '獸骨結晶', weight: 3.5, value: 90 },
  { name: '生物外殼', weight: 5, value: 120 },
  { name: '前人的手記', weight: 0.3, value: 60 },
  { name: '銹蝕的探窟具', weight: 4, value: 70 },
]

export const RELICS: readonly LootTemplate[] = [
  { name: '未鑑定遺物・小', weight: 3, value: 300 },
  { name: '未鑑定遺物・中', weight: 7, value: 700 },
  { name: '未鑑定遺物・大', weight: 14, value: 1500 },
]
