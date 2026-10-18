import type { GameCatalogItem } from "../../shared/api";

export const gameCatalog: readonly GameCatalogItem[] = [
  { id: "ooishi-territory-2", title: "大石のテリトリー2", description: "接続距離を選び、ゴールデンペアとシンクロで陣地を競う2〜4人用ゲーム。オンラインNPC対戦と全席操作の試遊に対応。", supportedModes: ["SOLO", "ONLINE"], minPlayers: 2, maxPlayers: 4 },
  { id: "two-sided-labyrinth", title: "表裏一体迷宮", description: "表と裏をつなぐ協力パズル。2人で声をかけ合い、1人でも練習できます。", supportedModes: ["SOLO", "ONLINE"], minPlayers: 2, maxPlayers: 2 },
  {
    id: "pon-inai",
    title: "ポンはいない",
    description: "公開された行動だけを材料に、誰がポンなのか——そもそもポンはいるのか——を推理する3〜4人用ゲーム。",
    supportedModes: ["ONLINE"],
    minPlayers: 3,
    maxPlayers: 4
  },
  {
    id: "commercial-hub",
    title: "商都開発",
    description: "商機を競り、商会を育てる都市開発ゲーム。人間1〜4人と常設NPCで4席対戦。終了方式・大型投資・ビッド・監査官を選べる正式版1.0。",
    supportedModes: ["ONLINE"],
    minPlayers: 4,
    maxPlayers: 4
  },
  {
    id: "ooishi-territory",
    title: "大石のテリトリー",
    description: "大石・中石・小石で陣地を奪い合う2〜4人用の短時間ゲーム。ムーンボレーで遠方へ進出。",
    supportedModes: ["SOLO", "ONLINE"],
    minPlayers: 2,
    maxPlayers: 4
  }
];

