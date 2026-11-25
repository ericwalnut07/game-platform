# 基礎数値検証10 — 混成部隊定点戦闘
基準2cf27ec067286115a399a31af351504946f31dce。新基準100+3×推奨Lv。検証用独立モデル、正式ミッションではない。全ユニット射程内、移動・方向・射線・地形・敵範囲攻撃・味方属性相性・状態異常・部位破壊・予告・増援なし。範囲は単一敵実体最大命中、他敵への同時命中なし。敵は通常攻撃のみ、B03は踏みつけ相当2回地上・再生6%・障壁30%固定。全味方が障壁範囲内、修理補給は地上のみ・射程内。自軍順:障壁→修理→攻撃→補給、敵順:再生→攻撃。敵は重装甲戦車→対怪獣戦車→DEF高い順（仮AI）。自軍は撃破可能優先、次に実ダメージ最大。敵レイヤーと対象武装を照合。共通HP/ATKと一部固有功績のみ、追加装備なし、個別解禁未確定。弾薬有限、補給は弾薬上限まで、補給装置補給不可。20R制限。検証用の敵編成・AIを採用仕様としない。部位成長案は部位処理未実装のため未比較。
## 入力と結果（JSON）
```json
{
 "P": {
  "T": [
   280,
   85,
   35,
   20,
   5,
   150,
   1,
   1,
   "G",
   1
  ],
  "H": [
   360,
   85,
   45,
   24,
   5,
   190,
   1,
   1,
   "G",
   1
  ],
  "A": [
   300,
   110,
   30,
   24,
   5,
   210,
   1,
   1,
   "G",
   1
  ],
  "C": [
   180,
   50,
   20,
   12,
   4,
   45,
   3,
   0,
   "G",
   1
  ],
  "F": [
   165,
   70,
   15,
   15,
   4,
   120,
   1,
   1,
   "G",
   1
  ],
  "S": [
   220,
   110,
   20,
   21,
   6,
   110,
   1,
   2,
   "G",
   9
  ],
  "Q": [
   150,
   80,
   12,
   15,
   7,
   180,
   1,
   1,
   "A",
   1
  ],
  "J": [
   190,
   110,
   15,
   26,
   10,
   50,
   4,
   0,
   "A",
   1
  ],
  "R": [
   180,
   40,
   15,
   14,
   8,
   0,
   0,
   0,
   "G",
   1
  ],
  "U": [
   160,
   25,
   12,
   12,
   8,
   0,
   0,
   0,
   "G",
   1
  ],
  "M": [
   380,
   145,
   30,
   42,
   13,
   160,
   1,
   2,
   "B",
   25,
   3
  ],
  "X": [
   500,
   165,
   50,
   45,
   13,
   280,
   1,
   1,
   "G",
   1
  ],
  "B": [
   200,
   125,
   10,
   28,
   11,
   190,
   1,
   2,
   "G",
   1,
   4
  ],
  "V": [
   300,
   40,
   25,
   30,
   14,
   0,
   0,
   0,
   "G",
   1,
   5
  ],
  "L": [
   320,
   150,
   25,
   38,
   13,
   220,
   1,
   6,
   "B",
   1
  ]
 },
 "E": {
  "k1": [
   70,
   35,
   3,
   1,
   "G",
   130,
   "G",
   [
    125,
    100,
    125,
    150,
    100,
    100,
    100,
    100
   ]
  ],
  "k3": [
   140,
   45,
   20,
   1,
   "G",
   150,
   "G",
   [
    50,
    125,
    100,
    75,
    100,
    100,
    125,
    75
   ]
  ],
  "k4": [
   90,
   40,
   4,
   1,
   "A",
   180,
   "G",
   [
    150,
    100,
    100,
    125,
    100,
    100,
    100,
    100
   ]
  ],
  "k6": [
   650,
   85,
   35,
   2,
   "G",
   180,
   "G",
   [
    50,
    125,
    100,
    75,
    100,
    100,
    125,
    75
   ]
  ],
  "k10": [
   1500,
   90,
   45,
   4,
   "G",
   180,
   "G",
   [
    50,
    125,
    100,
    75,
    100,
    100,
    125,
    75
   ]
  ],
  "k11": [
   1200,
   110,
   20,
   4,
   "G",
   150,
   "B",
   [
    100,
    100,
    100,
    100,
    100,
    125,
    50,
    100
   ]
  ],
  "k12": [
   1800,
   70,
   15,
   4,
   "G",
   140,
   "G",
   [
    100,
    100,
    100,
    150,
    125,
    100,
    100,
    100
   ],
   0.05
  ],
  "k16": [
   1200,
   110,
   15,
   4,
   "A",
   120,
   "G",
   [
    125,
    100,
    100,
    100,
    100,
    125,
    100,
    100
   ]
  ],
  "b3": [
   5500,
   185,
   45,
   9,
   "B",
   180,
   "G",
   [
    75,
    125,
    100,
    125,
    100,
    125,
    100,
    75
   ],
   0.06,
   0.3
  ]
 },
 "cases": [
  {
   "name": "地上殲滅",
   "lv": 6,
   "h": 1,
   "a": 1,
   "cap": 118,
   "en": [
    "k1",
    "k1",
    "k1",
    "k1",
    "k3",
    "k3",
    "k6"
   ],
   "p": [
    "H",
    "T",
    "F",
    "C",
    "S"
   ],
   "q": [
    "H",
    "T",
    "F",
    "S",
    "R"
   ],
   "pc": 95,
   "qc": 96
  },
  {
   "name": "航空混成",
   "lv": 15,
   "h": 1,
   "a": 1,
   "cap": 145,
   "en": [
    "k4",
    "k4",
    "k16",
    "k6",
    "k11"
   ],
   "p": [
    "H",
    "T",
    "S",
    "Q",
    "J",
    "C"
   ],
   "q": [
    "H",
    "S",
    "Q",
    "J",
    "R",
    "F"
   ],
   "pc": 120,
   "qc": 115
  },
  {
   "name": "大型混成",
   "lv": 35,
   "h": 1.25,
   "a": 1.2,
   "cap": 205,
   "en": [
    "k10",
    "k12",
    "k11",
    "k6",
    "k6"
   ],
   "p": [
    "H",
    "A",
    "T",
    "S",
    "S",
    "X",
    "F"
   ],
   "q": [
    "H",
    "A",
    "S",
    "X",
    "R",
    "V",
    "F"
   ],
   "pc": 184,
   "qc": 176
  },
  {
   "name": "巨大ボス",
   "lv": 50,
   "h": 1.6,
   "a": 1.4,
   "cap": 250,
   "en": [
    "b3"
   ],
   "p": [
    "H",
    "A",
    "X",
    "M",
    "S",
    "L"
   ],
   "q": [
    "H",
    "X",
    "M",
    "S",
    "R",
    "U",
    "V"
   ],
   "pc": 216,
   "qc": 196
  }
 ],
 "rows": [
  {
   "name": "地上殲滅",
   "mode": "p",
   "m": 0,
   "cost": 95,
   "result": "勝利",
   "round": 3,
   "survivors": 5,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 0,
   "log": [
    [
     1,
     5,
     2,
     908
    ],
    [
     2,
     5,
     1,
     411
    ],
    [
     3,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "地上殲滅",
   "mode": "q",
   "m": 0,
   "cost": 96,
   "result": "勝利",
   "round": 4,
   "survivors": 5,
   "repair": 413,
   "supply": 0,
   "shield": 0,
   "blocked": 0,
   "log": [
    [
     1,
     5,
     3,
     988
    ],
    [
     2,
     5,
     1,
     545
    ],
    [
     3,
     5,
     1,
     29
    ],
    [
     4,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "地上殲滅",
   "mode": "p",
   "m": 3,
   "cost": 95,
   "result": "勝利",
   "round": 3,
   "survivors": 5,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 33,
   "log": [
    [
     1,
     5,
     2,
     827
    ],
    [
     2,
     5,
     1,
     324
    ],
    [
     3,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "地上殲滅",
   "mode": "q",
   "m": 3,
   "cost": 96,
   "result": "勝利",
   "round": 3,
   "survivors": 5,
   "repair": 228,
   "supply": 0,
   "shield": 0,
   "blocked": 34,
   "log": [
    [
     1,
     5,
     3,
     907
    ],
    [
     2,
     5,
     1,
     491
    ],
    [
     3,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "地上殲滅",
   "mode": "p",
   "m": 5,
   "cost": 95,
   "result": "勝利",
   "round": 3,
   "survivors": 5,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 53,
   "log": [
    [
     1,
     5,
     2,
     827
    ],
    [
     2,
     5,
     1,
     261
    ],
    [
     3,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "地上殲滅",
   "mode": "q",
   "m": 5,
   "cost": 96,
   "result": "勝利",
   "round": 3,
   "survivors": 5,
   "repair": 208,
   "supply": 0,
   "shield": 0,
   "blocked": 54,
   "log": [
    [
     1,
     5,
     3,
     907
    ],
    [
     2,
     5,
     1,
     454
    ],
    [
     3,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "航空混成",
   "mode": "p",
   "m": 0,
   "cost": 120,
   "result": "全滅",
   "round": 10,
   "survivors": 0,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 0,
   "log": [
    [
     1,
     6,
     3,
     3636
    ],
    [
     2,
     5,
     2,
     2605
    ],
    [
     3,
     4,
     2,
     1681
    ],
    [
     4,
     3,
     2,
     908
    ],
    [
     5,
     3,
     1,
     596
    ],
    [
     6,
     2,
     1,
     566
    ],
    [
     7,
     2,
     1,
     566
    ],
    [
     8,
     1,
     1,
     566
    ],
    [
     9,
     1,
     1,
     566
    ],
    [
     10,
     0,
     1,
     566
    ]
   ]
  },
  {
   "name": "航空混成",
   "mode": "q",
   "m": 0,
   "cost": 115,
   "result": "全滅",
   "round": 7,
   "survivors": 0,
   "repair": 378,
   "supply": 0,
   "shield": 0,
   "blocked": 0,
   "log": [
    [
     1,
     6,
     3,
     3740
    ],
    [
     2,
     5,
     3,
     2675
    ],
    [
     3,
     4,
     3,
     1836
    ],
    [
     4,
     2,
     3,
     1266
    ],
    [
     5,
     1,
     2,
     1000
    ],
    [
     6,
     1,
     1,
     897
    ],
    [
     7,
     0,
     1,
     897
    ]
   ]
  },
  {
   "name": "航空混成",
   "mode": "p",
   "m": 3,
   "cost": 120,
   "result": "勝利",
   "round": 5,
   "survivors": 4,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 96,
   "log": [
    [
     1,
     6,
     3,
     3496
    ],
    [
     2,
     5,
     2,
     2474
    ],
    [
     3,
     5,
     2,
     1395
    ],
    [
     4,
     4,
     2,
     316
    ],
    [
     5,
     4,
     0,
     0
    ]
   ]
  },
  {
   "name": "航空混成",
   "mode": "q",
   "m": 3,
   "cost": 115,
   "result": "全滅",
   "round": 10,
   "survivors": 0,
   "repair": 240,
   "supply": 0,
   "shield": 0,
   "blocked": 116,
   "log": [
    [
     1,
     6,
     3,
     3626
    ],
    [
     2,
     5,
     3,
     2401
    ],
    [
     3,
     4,
     2,
     1586
    ],
    [
     4,
     4,
     2,
     952
    ],
    [
     5,
     3,
     1,
     694
    ],
    [
     6,
     2,
     1,
     580
    ],
    [
     7,
     2,
     1,
     466
    ],
    [
     8,
     1,
     1,
     352
    ],
    [
     9,
     1,
     1,
     352
    ],
    [
     10,
     0,
     1,
     352
    ]
   ]
  },
  {
   "name": "航空混成",
   "mode": "p",
   "m": 5,
   "cost": 120,
   "result": "勝利",
   "round": 5,
   "survivors": 5,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 158,
   "log": [
    [
     1,
     6,
     3,
     3394
    ],
    [
     2,
     5,
     2,
     1990
    ],
    [
     3,
     5,
     2,
     791
    ],
    [
     4,
     5,
     1,
     30
    ],
    [
     5,
     5,
     0,
     0
    ]
   ]
  },
  {
   "name": "航空混成",
   "mode": "q",
   "m": 5,
   "cost": 115,
   "result": "勝利",
   "round": 5,
   "survivors": 6,
   "repair": 1096,
   "supply": 0,
   "shield": 0,
   "blocked": 280,
   "log": [
    [
     1,
     6,
     3,
     3544
    ],
    [
     2,
     6,
     3,
     2199
    ],
    [
     3,
     6,
     2,
     1022
    ],
    [
     4,
     6,
     1,
     30
    ],
    [
     5,
     6,
     0,
     0
    ]
   ]
  },
  {
   "name": "大型混成",
   "mode": "p",
   "m": 0,
   "cost": 184,
   "result": "全滅",
   "round": 6,
   "survivors": 0,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 0,
   "log": [
    [
     1,
     6,
     4,
     12292
    ],
    [
     2,
     5,
     3,
     10097
    ],
    [
     3,
     4,
     3,
     8136
    ],
    [
     4,
     3,
     3,
     7197
    ],
    [
     5,
     2,
     3,
     6495
    ],
    [
     6,
     0,
     3,
     6188
    ]
   ]
  },
  {
   "name": "大型混成",
   "mode": "q",
   "m": 0,
   "cost": 176,
   "result": "全滅",
   "round": 8,
   "survivors": 0,
   "repair": 773,
   "supply": 0,
   "shield": 5,
   "blocked": 1091,
   "log": [
    [
     1,
     6,
     4,
     12687
    ],
    [
     2,
     5,
     3,
     10887
    ],
    [
     3,
     5,
     3,
     9558
    ],
    [
     4,
     5,
     3,
     8229
    ],
    [
     5,
     4,
     3,
     6900
    ],
    [
     6,
     3,
     3,
     6593
    ],
    [
     7,
     2,
     3,
     6286
    ],
    [
     8,
     0,
     3,
     6374
    ]
   ]
  },
  {
   "name": "大型混成",
   "mode": "p",
   "m": 3,
   "cost": 184,
   "result": "勝利",
   "round": 8,
   "survivors": 2,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 134,
   "log": [
    [
     1,
     6,
     4,
     11456
    ],
    [
     2,
     5,
     4,
     8283
    ],
    [
     3,
     5,
     3,
     5811
    ],
    [
     4,
     4,
     2,
     3835
    ],
    [
     5,
     3,
     1,
     2865
    ],
    [
     6,
     3,
     1,
     1752
    ],
    [
     7,
     2,
     1,
     639
    ],
    [
     8,
     2,
     0,
     0
    ]
   ]
  },
  {
   "name": "大型混成",
   "mode": "q",
   "m": 3,
   "cost": 176,
   "result": "勝利",
   "round": 7,
   "survivors": 6,
   "repair": 1843,
   "supply": 0,
   "shield": 5,
   "blocked": 1664,
   "log": [
    [
     1,
     7,
     5,
     11904
    ],
    [
     2,
     6,
     4,
     9247
    ],
    [
     3,
     6,
     3,
     7615
    ],
    [
     4,
     6,
     2,
     5775
    ],
    [
     5,
     6,
     2,
     3735
    ],
    [
     6,
     6,
     1,
     1788
    ],
    [
     7,
     6,
     0,
     0
    ]
   ]
  },
  {
   "name": "大型混成",
   "mode": "p",
   "m": 5,
   "cost": 184,
   "result": "勝利",
   "round": 6,
   "survivors": 4,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 222,
   "log": [
    [
     1,
     6,
     4,
     11198
    ],
    [
     2,
     5,
     3,
     7980
    ],
    [
     3,
     5,
     3,
     5040
    ],
    [
     4,
     5,
     1,
     2842
    ],
    [
     5,
     4,
     1,
     25
    ],
    [
     6,
     4,
     0,
     0
    ]
   ]
  },
  {
   "name": "大型混成",
   "mode": "q",
   "m": 5,
   "cost": 176,
   "result": "勝利",
   "round": 6,
   "survivors": 7,
   "repair": 1875,
   "supply": 0,
   "shield": 5,
   "blocked": 2186,
   "log": [
    [
     1,
     7,
     5,
     11471
    ],
    [
     2,
     7,
     4,
     9021
    ],
    [
     3,
     7,
     3,
     6779
    ],
    [
     4,
     7,
     2,
     3862
    ],
    [
     5,
     7,
     1,
     1051
    ],
    [
     6,
     7,
     0,
     0
    ]
   ]
  },
  {
   "name": "巨大ボス",
   "mode": "p",
   "m": 0,
   "cost": 216,
   "result": "全滅",
   "round": 4,
   "survivors": 0,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 0,
   "log": [
    [
     1,
     4,
     1,
     19363
    ],
    [
     2,
     3,
     1,
     17672
    ],
    [
     3,
     1,
     1,
     16848
    ],
    [
     4,
     0,
     1,
     17622
    ]
   ]
  },
  {
   "name": "巨大ボス",
   "mode": "q",
   "m": 0,
   "cost": 196,
   "result": "全滅",
   "round": 5,
   "survivors": 0,
   "repair": 0,
   "supply": 5,
   "shield": 4,
   "blocked": 2001,
   "log": [
    [
     1,
     6,
     1,
     20251
    ],
    [
     2,
     5,
     1,
     19040
    ],
    [
     3,
     4,
     1,
     18696
    ],
    [
     4,
     2,
     1,
     19470
    ],
    [
     5,
     0,
     1,
     20774
    ]
   ]
  },
  {
   "name": "巨大ボス",
   "mode": "p",
   "m": 3,
   "cost": 216,
   "result": "全滅",
   "round": 5,
   "survivors": 0,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 238,
   "log": [
    [
     1,
     5,
     1,
     18477
    ],
    [
     2,
     4,
     1,
     15520
    ],
    [
     3,
     3,
     1,
     13090
    ],
    [
     4,
     1,
     1,
     13151
    ],
    [
     5,
     0,
     1,
     13800
    ]
   ]
  },
  {
   "name": "巨大ボス",
   "mode": "q",
   "m": 3,
   "cost": 196,
   "result": "全滅",
   "round": 7,
   "survivors": 0,
   "repair": 790,
   "supply": 7,
   "shield": 5,
   "blocked": 3557,
   "log": [
    [
     1,
     6,
     1,
     19592
    ],
    [
     2,
     6,
     1,
     17750
    ],
    [
     3,
     5,
     1,
     15908
    ],
    [
     4,
     4,
     1,
     15185
    ],
    [
     5,
     3,
     1,
     15834
    ],
    [
     6,
     1,
     1,
     16483
    ],
    [
     7,
     0,
     1,
     17787
    ]
   ]
  },
  {
   "name": "巨大ボス",
   "mode": "p",
   "m": 5,
   "cost": 216,
   "result": "全滅",
   "round": 5,
   "survivors": 0,
   "repair": 0,
   "supply": 0,
   "shield": 0,
   "blocked": 398,
   "log": [
    [
     1,
     5,
     1,
     17820
    ],
    [
     2,
     4,
     1,
     14225
    ],
    [
     3,
     3,
     1,
     11247
    ],
    [
     4,
     1,
     1,
     11133
    ],
    [
     5,
     0,
     1,
     11686
    ]
   ]
  },
  {
   "name": "巨大ボス",
   "mode": "q",
   "m": 5,
   "cost": 196,
   "result": "全滅",
   "round": 8,
   "survivors": 0,
   "repair": 902,
   "supply": 9,
   "shield": 6,
   "blocked": 5260,
   "log": [
    [
     1,
     7,
     1,
     19104
    ],
    [
     2,
     6,
     1,
     16472
    ],
    [
     3,
     6,
     1,
     14161
    ],
    [
     4,
     5,
     1,
     11850
    ],
    [
     5,
     4,
     1,
     10841
    ],
    [
     6,
     3,
     1,
     11394
    ],
    [
     7,
     1,
     1,
     11947
    ],
    [
     8,
     0,
     1,
     13251
    ]
   ]
  }
 ],
 "sensitivity": [
  {
   "bonus": 0.2,
   "atk": 1.3,
   "ammoCost": 1,
   "result": "全滅",
   "round": 9,
   "survivors": 0,
   "repair": 1804,
   "supply": 11,
   "shield": 7,
   "blocked": 5626,
   "log": [
    [
     1,
     7,
     1,
     19649
    ],
    [
     2,
     6,
     1,
     17562
    ],
    [
     3,
     6,
     1,
     15796
    ],
    [
     4,
     5,
     1,
     14030
    ],
    [
     5,
     5,
     1,
     13566
    ],
    [
     6,
     4,
     1,
     13102
    ],
    [
     7,
     3,
     1,
     13832
    ],
    [
     8,
     1,
     1,
     14562
    ],
    [
     9,
     0,
     1,
     15866
    ]
   ]
  },
  {
   "bonus": 0.2,
   "atk": 1.3,
   "ammoCost": 2,
   "result": "全滅",
   "round": 9,
   "survivors": 0,
   "repair": 1804,
   "supply": 9,
   "shield": 7,
   "blocked": 5626,
   "log": [
    [
     1,
     7,
     1,
     19649
    ],
    [
     2,
     6,
     1,
     17562
    ],
    [
     3,
     6,
     1,
     15796
    ],
    [
     4,
     5,
     1,
     14030
    ],
    [
     5,
     5,
     1,
     13566
    ],
    [
     6,
     4,
     1,
     13102
    ],
    [
     7,
     3,
     1,
     13832
    ],
    [
     8,
     1,
     1,
     14562
    ],
    [
     9,
     0,
     1,
     15866
    ]
   ]
  },
  {
   "bonus": 0.2,
   "atk": 1.4,
   "ammoCost": 1,
   "result": "全滅",
   "round": 8,
   "survivors": 0,
   "repair": 902,
   "supply": 9,
   "shield": 6,
   "blocked": 5260,
   "log": [
    [
     1,
     7,
     1,
     19649
    ],
    [
     2,
     6,
     1,
     17562
    ],
    [
     3,
     6,
     1,
     15796
    ],
    [
     4,
     5,
     1,
     14030
    ],
    [
     5,
     4,
     1,
     13566
    ],
    [
     6,
     3,
     1,
     14296
    ],
    [
     7,
     1,
     1,
     15026
    ],
    [
     8,
     0,
     1,
     16330
    ]
   ]
  },
  {
   "bonus": 0.2,
   "atk": 1.4,
   "ammoCost": 2,
   "result": "全滅",
   "round": 8,
   "survivors": 0,
   "repair": 902,
   "supply": 8,
   "shield": 6,
   "blocked": 5260,
   "log": [
    [
     1,
     7,
     1,
     19649
    ],
    [
     2,
     6,
     1,
     17562
    ],
    [
     3,
     6,
     1,
     15796
    ],
    [
     4,
     5,
     1,
     14030
    ],
    [
     5,
     4,
     1,
     13566
    ],
    [
     6,
     3,
     1,
     14296
    ],
    [
     7,
     1,
     1,
     15026
    ],
    [
     8,
     0,
     1,
     16330
    ]
   ]
  },
  {
   "bonus": 0.3,
   "atk": 1.3,
   "ammoCost": 1,
   "result": "全滅",
   "round": 9,
   "survivors": 0,
   "repair": 1804,
   "supply": 11,
   "shield": 7,
   "blocked": 5626,
   "log": [
    [
     1,
     7,
     1,
     19104
    ],
    [
     2,
     6,
     1,
     16472
    ],
    [
     3,
     6,
     1,
     14161
    ],
    [
     4,
     5,
     1,
     11850
    ],
    [
     5,
     5,
     1,
     10841
    ],
    [
     6,
     4,
     1,
     9832
    ],
    [
     7,
     3,
     1,
     10385
    ],
    [
     8,
     1,
     1,
     10938
    ],
    [
     9,
     0,
     1,
     12242
    ]
   ]
  },
  {
   "bonus": 0.3,
   "atk": 1.3,
   "ammoCost": 2,
   "result": "全滅",
   "round": 9,
   "survivors": 0,
   "repair": 1804,
   "supply": 9,
   "shield": 7,
   "blocked": 5626,
   "log": [
    [
     1,
     7,
     1,
     19104
    ],
    [
     2,
     6,
     1,
     16472
    ],
    [
     3,
     6,
     1,
     14161
    ],
    [
     4,
     5,
     1,
     11850
    ],
    [
     5,
     5,
     1,
     10841
    ],
    [
     6,
     4,
     1,
     9832
    ],
    [
     7,
     3,
     1,
     10385
    ],
    [
     8,
     1,
     1,
     10938
    ],
    [
     9,
     0,
     1,
     12242
    ]
   ]
  },
  {
   "bonus": 0.3,
   "atk": 1.4,
   "ammoCost": 1,
   "result": "全滅",
   "round": 8,
   "survivors": 0,
   "repair": 902,
   "supply": 9,
   "shield": 6,
   "blocked": 5260,
   "log": [
    [
     1,
     7,
     1,
     19104
    ],
    [
     2,
     6,
     1,
     16472
    ],
    [
     3,
     6,
     1,
     14161
    ],
    [
     4,
     5,
     1,
     11850
    ],
    [
     5,
     4,
     1,
     10841
    ],
    [
     6,
     3,
     1,
     11394
    ],
    [
     7,
     1,
     1,
     11947
    ],
    [
     8,
     0,
     1,
     13251
    ]
   ]
  },
  {
   "bonus": 0.3,
   "atk": 1.4,
   "ammoCost": 2,
   "result": "全滅",
   "round": 8,
   "survivors": 0,
   "repair": 902,
   "supply": 8,
   "shield": 6,
   "blocked": 5260,
   "log": [
    [
     1,
     7,
     1,
     19104
    ],
    [
     2,
     6,
     1,
     16472
    ],
    [
     3,
     6,
     1,
     14161
    ],
    [
     4,
     5,
     1,
     11850
    ],
    [
     5,
     4,
     1,
     10841
    ],
    [
     6,
     3,
     1,
     11394
    ],
    [
     7,
     1,
     1,
     11947
    ],
    [
     8,
     0,
     1,
     13251
    ]
   ]
  }
 ]
}
```
## 再現コード（JavaScript）
```js
ks=>{let g={},n={};return ks.slice().sort((a,b)=>P[b][3]-P[a][3]||a.localeCompare(b)).reduce((s,k)=>{let p=P[k],t=g[p[4]]||0,m=n[k]||0;g[p[4]]=t+1;n[k]=m+1;return s+Math.ceil(p[3]*(100+rates[p[4]][0]*t+rates[p[4]][1]*m)/100)},0)}
function sim(c,ks,merit,bonus,ammoCost=1,atkScale=c.a){
const p=ks.map((k,i)=>{let d=P[k],hp=Math.floor(Math.floor(d[0]*(100+3*(c.lv-1))/100)*(100+4*merit)/100);return {k,i,d,hp,max:hp,atk:Math.floor(Math.floor(d[1]*(1000+25*(c.lv-1))/1000)*(100+(["R","U","V"].includes(k)?0:3*merit))/100),ammo:d[10]??Infinity,used:0}});
const e=c.en.map((k,i)=>{let d=E[k],hp=Math.floor(d[0]*(100+3*(c.lv-1))/100*c.h+1e-8);return {k,i,d,hp,max:hp,atk:Math.floor(d[1]*(1000+25*(c.lv-1))/1000*atkScale+1e-8)}});
let log=[],repair=0,supply=0,shield=0,blocked=0;const live=a=>a.filter(x=>x.hp>0);
for(let round=1;round<=20;round++){
let barrier=0;for(let u of live(p).filter(u=>u.k==="V"))if(u.ammo>0){u.ammo--;barrier=25+3*merit;shield++}
for(let u of live(p).filter(u=>u.k==="R")){let t=live(p).filter(t=>!air(t.k)&&t.hp<t.max&&t!==u).sort((a,b)=>(b.max-b.hp)-(a.max-a.hp))[0];if(t){let h=Math.min(t.max-t.hp,Math.floor(u.atk*3.5*(100+9*merit)/100));t.hp+=h;repair+=h}}
for(let u of live(p).filter(u=>!["R","U","V"].includes(u.k))){
if(u.ammo<=0)continue;let cand=live(e).filter(t=>u.d[8]==="B"||t.d[4]==="B"||u.d[8]===t.d[4]);if(!cand.length)continue;
function hit(t){let pen=u.k==="X"||u.k==="B"?.2:0;let raw=Math.max(1,Math.floor(u.atk*u.d[5]/100-t.d[2]*(1-pen)+1e-8))*u.d[6];let mult=1+bonus*(Math.min(u.d[9],t.d[3])-1);let solid=u.k==="A"||u.k==="X"?t.d[3]>=4?6*merit:0:["T","S","M","L","C","F"].includes(u.k)?4*merit:0;return Math.max(1,Math.floor(raw*t.d[7][u.d[7]]/100*mult*(100+solid)/100*(1-(t.d[9]||0))))}
cand.sort((a,b)=>Number(hit(b)>=b.hp)-Number(hit(a)>=a.hp)||Math.min(b.hp,hit(b))-Math.min(a.hp,hit(a))||a.hp-b.hp||a.i-b.i);let t=cand[0];t.hp=Math.max(0,t.hp-hit(t));u.ammo--;u.used++;
}
for(let u of live(p).filter(u=>u.k==="U")){let t=live(p).filter(t=>!air(t.k)&&Number.isFinite(t.d[10])&&t.ammo<t.d[10]).sort((a,b)=>a.ammo-b.ammo)[0];if(t&&u.used<5+merit+Math.floor(merit/2)){let n=Math.min(t.d[10]-t.ammo,Math.floor(2/(t.k==="M"?ammoCost:1)));if(n){t.ammo+=n;u.used++;supply+=n}}}
if(!live(e).length){log.push([round,live(p).length,0,0]);return {result:"勝利",round,survivors:live(p).length,repair,supply,shield,blocked,log}}
for(let t of live(e)){let heal=Math.min(t.max-t.hp,Math.floor(t.max*(t.d[8]||0)));t.hp+=heal;
for(let j=0;j<(t.k==="b3"?2:1);j++){let cand=live(p).filter(u=>t.d[6]==="B"||t.d[6]===(air(u.k)?"A":"G"));if(!cand.length)continue; // frontline fixed priority
cand.sort((a,b)=>Number(b.k==="H")-Number(a.k==="H")||Number(b.k==="A")-Number(a.k==="A")||b.d[2]-a.d[2]||a.i-b.i);let u=cand[0];let raw=Math.max(1,Math.floor(t.atk*t.d[5]/100-u.d[2]));let d=Math.floor(raw*(u.k==="H"?1-.04*merit:1)*(1-barrier/100)+1e-8);blocked+=raw-d;u.hp=Math.max(0,u.hp-d)}}
log.push([round,live(p).length,live(e).length,live(e).reduce((s,t)=>s+t.hp,0)]);if(!live(p).length)return {result:"全滅",round,survivors:0,repair,supply,shield,blocked,log};
}
return {result:"時間切れ",round:20,survivors:live(p).length,repair,supply,shield,blocked,log}}
// 上記JSONのP/E/casesと rates={"4":[5,15],"5":[10,15],"6":[10,20],"7":[5,20],"8":[5,20],"10":[10,20],"11":[15,20],"13":[15,25],"14":[10,25]}、air=k=>['J','B'].includes(k) を用いる。
```
