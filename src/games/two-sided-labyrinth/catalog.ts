export const LABYRINTH_ID = "two-sided-labyrinth" as const;
export const RULES_VERSION = "1.0-web.1" as const;
export const STAGES = [
  {
    "stageId": "tutorial-01",
    "category": "tutorial",
    "title": "はじめての壁",
    "width": 5,
    "height": 7
  },
  {
    "stageId": "tutorial-02",
    "category": "tutorial",
    "title": "道を譲り合う",
    "width": 7,
    "height": 9
  },
  {
    "stageId": "tutorial-03",
    "category": "tutorial",
    "title": "床を裏返せ",
    "width": 7,
    "height": 9
  },
  {
    "stageId": "tutorial-04",
    "category": "tutorial",
    "title": "ふたりで起動",
    "width": 7,
    "height": 11
  },
  {
    "stageId": "tutorial-05",
    "category": "tutorial",
    "title": "回転部屋の基本",
    "width": 9,
    "height": 11
  },
  {
    "stageId": "tutorial-06",
    "category": "tutorial",
    "title": "先に渡って、道を変えて",
    "width": 9,
    "height": 21
  },
  {
    "stageId": "tutorial-07",
    "category": "tutorial",
    "title": "4つの仕掛け",
    "width": 9,
    "height": 28
  },
  {
    "stageId": "tutorial-08",
    "category": "tutorial",
    "title": "置いていかないで",
    "width": 11,
    "height": 33
  },
  {
    "stageId": "tutorial-09",
    "category": "tutorial",
    "title": "どちらから開く？",
    "width": 11,
    "height": 28
  },
  {
    "stageId": "tutorial-10",
    "category": "tutorial",
    "title": "ふたりの迷宮",
    "width": 13,
    "height": 36
  },
  {
    "stageId": "challenge-01",
    "category": "challenge",
    "title": "天秤リフト",
    "width": 17,
    "height": 25
  },
  {
    "stageId": "challenge-02",
    "category": "challenge",
    "title": "影を渡す",
    "width": 19,
    "height": 27
  },
  {
    "stageId": "challenge-03",
    "category": "challenge",
    "title": "鍵と光を託して",
    "width": 21,
    "height": 29
  },
  {
    "stageId": "challenge-04",
    "category": "challenge",
    "title": "電力を分け合って",
    "width": 23,
    "height": 31
  },
  {
    "stageId": "challenge-05",
    "category": "challenge",
    "title": "共鳴のリレー",
    "width": 25,
    "height": 33
  },
  {
    "stageId": "challenge-06",
    "category": "challenge",
    "title": "上へ、そして戻れ",
    "width": 27,
    "height": 43
  },
  {
    "stageId": "challenge-07",
    "category": "challenge",
    "title": "光を託し、電力をつなぐ",
    "width": 21,
    "height": 37
  },
  {
    "stageId": "challenge-08",
    "category": "challenge",
    "title": "光が届くまで",
    "width": 27,
    "height": 37
  },
  {
    "stageId": "challenge-09",
    "category": "challenge",
    "title": "道を譲り、道を戻す",
    "width": 27,
    "height": 43
  },
  {
    "stageId": "challenge-10",
    "category": "challenge",
    "title": "表裏一体",
    "width": 27,
    "height": 59
  }
] as const;
export type StageId = typeof STAGES[number]["stageId"];
