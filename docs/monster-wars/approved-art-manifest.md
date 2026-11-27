# 採用画像管理表
PR #198、依存 #197、最終統合先 main。基準 68c5b8732243711100ec8553f3b4648984e9b277。
既存の infantry/tank/helicopter/K06/K21 は組込済み。以下6種はユーザー承認済み原本（1448×1086 RGBA PNG）。添付パック monster-wars-approved-six.zip 内の原本を照合済み。表示用WebPを戦闘・図鑑に登録した。
|ID|モデル|原本名|SHA-256|
|---|---|---|---|
|apc|標準装甲車|apc-original.png|6ee3087865888dbe919da2208d15f5ec7ddca5101cfb07f35271f3c1479cfdbb|
|heavy|重装甲戦車|heavy-original.png|0aa0d3461dd8ada7c14244a52f13b9f6cec9526f8cb6d0df3019cf53d7fa1cfc|
|aa|対空機関砲車|aa-original.png|42cd2abfbbab82edd39c60341dea406280e6bbad9cf4c863fd7bca47e0841730|
|lightArt|軽自走砲|lightArt-original.png|b75495e21d69f79a007080af26dc4f876100f49941e08c99804934deaccf900a|
|heavyArt|重自走砲|heavyArt-original.png|0c092caed424b27a40694e15a6c1876ea98f37156424aa066bed8551dc75e84e|
|repair|修理車|repair-original.png|3d0b66eccf5a2bb185a7d9812b3cf92ca49298f8431a9c6ce38c16fb1be3e0b0|
自走砲は後方箱型砲塔・上向き単装砲（軽30〜40度、重35〜45度をデザイン基準）で水平砲身の戦車と区別。採用画像を優先し、色・形状の差分は勝手に修正しない。修理車はクレーンと工具マーク。次は補給車（緑、コンテナ）と対物狙撃兵（橙、V字）の試作。


## 正式画像の原本・表示用ファイル対応

`apps/monster-wars/art/formal/<ID>.webp` は以下の原本に対応する。原本PNGは採用時の添付のまま保管する。

| ID | 原本 | 組込寸法 px | SHA-256 |
|---|---|---:|---|
|K01|K01-original.png|352×326|`16b26a9bce73c388ae421e7c66231d4ced68cf525034d2a52281528685cab6a1`|
|K03|K03-original.png|352×254|`8693a9ae1f083d65542daece41a35ee0baedd2c90d12edd4ae681affa02f8fd8`|
|K04|K04-original.png|352×242|`a448f17d52ee35d34f442014212131ee14e564572d0f19b144e7c8f83fbf8b6c`|
|K06-NE|7205.png|264×194|`a01b660dc1071991ee4632aae460136bb3961c6f19abccc3a233222254763fa3`|
|K06-NW|7203.png|264×176|`a6d7b40fabebbcd9e2f5a5742efd58c96251533e0ac9e6f3b3e5269c2a8e0c3a`|
|K06-SE|7202.png|264×245|`3fd40094a416f8e0c92465d9bf60d9115a453ff120d87002d42068c073f1ce81`|
|K06-SW|7204.png|264×222|`00f01dd2a31bb1b5cefb2c27912340ab7e5c0812b1fc5a8cfcaf189203ab011f`|
|K11|K11-original.png|352×267|`88aef5893c668075a2f194f69ed625308a3bd902cbdc4e1b2309517a722d1089`|
|K11-NE|7210.png|300×241|`7a4ca1a9373c069da8854b98473b9ee884b2fe15c2b9425afad81a88fba73cee`|
|K11-NW|7211.png|300×218|`08a62d07dc3b4786aaa50bf949cca794c7e46ad2682c8eaf7438f255fdc127a9`|
|K11-SE|7212.png|300×232|`5b88cc6ce63bdf78dc028c7651a7a02feb76a52cbedafbc446c077369e2ed98f`|
|K11-SW|7213.png|300×226|`c84667982723b03764e59e9c33a24b8d64ab62f12b1673d4da0d882b8301537a`|
|K21-NE|7217.png|370×380|`0b2922efb2148179b9740c20155045ce983998155df0f43447352d63dfcaa20f`|
|K21-NW|7214.png|380×369|`c077bf1a0f7c8126a1ff71cd93ba77f6e505573651cd0f3be031a894c2ff3fba`|
|K21-SE|7216.png|376×380|`d91e6dd1dd2ed42dd45dfeca80dbfc8ac9ce7c39e742c1d3c3857859ffe7d371`|
|K21-SW|7215.png|379×380|`9cffd49e004103af9bfd80f82d3ecd2d2f2dd567183240cc3e86482c6039956e`|
|aa|aa-original.png|350×352|`42cd2abfbbab82edd39c60341dea406280e6bbad9cf4c863fd7bca47e0841730`|
|apc|apc-original.png|352×324|`6ee3087865888dbe919da2208d15f5ec7ddca5101cfb07f35271f3c1479cfdbb`|
|heavy|heavy-original.png|352×313|`0aa0d3461dd8ada7c14244a52f13b9f6cec9526f8cb6d0df3019cf53d7fa1cfc`|
|heavy-NE|heavy-NE.png|256×210|`6b2a47d447d3084f3b5b004bdad67d6e432b4b7bb02fb0f70ce4e7dfdc8bc0ad`|
|heavy-NW|heavy-NW.png|256×212|`8d60ec73aabb3523483398e65e90e036d3795a15a6fcf33340aa69e69c8a8840`|
|heavy-SE|heavy-SE.png|256×228|`fe3e2e7ef97e1ee2818f6744160d191814c3a70023cbac354387cda8622fbe04`|
|heavy-SW|heavy-SW.png|256×222|`ec604f540f27badf8469560c4363623d0066bb8121409120b7299474e834e7cd`|
|heavyArt|heavyArt-original.png|352×291|`0c092caed424b27a40694e15a6c1876ea98f37156424aa066bed8551dc75e84e`|
|lightArt|lightArt-original.png|352×344|`b75495e21d69f79a007080af26dc4f876100f49941e08c99804934deaccf900a`|
|object_building|object_building_01.png|256×223|`a42b759328f16a964e3b39f05266940f1d12110cff133c38f017f2de927ef3f3`|
|object_defense_facility|object_defense_facility_01.png|256×238|`eb72d715a0b2091d5496a20ba56642cee7c68fc2eae7cc152eb82f82068e34d4`|
|object_defensive_position|object_defensive_position_01.png|256×187|`0a6ff64ed62d59f52bcfe3ea91a24d6f7592682cbdfad780545e14684ad61c55`|
|object_forest|object_forest_01.png|250×256|`28859969f4f3e455c9c3342cbbca4b6a26aa418bff12fe91cd88c5bd40d3f51f`|
|object_mountain|object_mountain_01.png|256×196|`d4cf1074c9546d34c8c0c2a4ee60f071dbd355037e1f6ab9db8b895153275971`|
|repair|repair-original.png|352×294|`3d0b66eccf5a2bb185a7d9812b3cf92ca49298f8431a9c6ce38c16fb1be3e0b0`|
|sniper|sniper-original.png|351×352|`19295d06fae56219ba3d587ad5a204e6d58a87cb9f50e8f685dc40fc1c021eb7`|
|supply|supply-original.png|352×269|`5f62bf83cbee7974b64a8362058f9861a6baba5a7c7e1ec80cb921c9a406a70a`|
|tank-NE|7201.png|220×186|`90306892ba4ab0cea545034b10288622c1c0e4473681b1e7cc95c7b405cc3598`|
|tank-NW|7200.png|220×186|`ea92a0becb28b775e8a40f7bae46ff2c95cc6693f1ba3916b448014558752527`|
|tank-SE|7198.png|220×203|`d17cd0418c62e04aaeb2a2e2cb7673aaca82a2fcd3d94cbf09bbb06f972e3274`|
|tank-SW|7199.png|220×206|`a2985074de48ee49450355342eaa1811b3f5394f62e0a5927513e637c2085f06`|
|terrain_forest|terrain_forest_01.png|160×160|`7c4edb7b2707579446c962913cee43fd45a49b5e2e6640cecad1ac6187055498`|
|terrain_mountain|terrain_mountain_01.png|160×160|`c43b358d62754ae5a19f1e2edd465f2259653e1ac3d643fe4016ba8bb366b70d`|
|terrain_plain|terrain_plain_01.png|160×160|`e865f7e2a27d895118622c2d278db6d61e2956c1c22f1e293844f148560b5add`|
|terrain_road|terrain_road_01.png|160×160|`ba7c8051a0837237d5aebef24f307f68a4ead8c3287f5bbec4d839e539bda73a`|
|terrain_rubble|terrain_rubble_01.png|160×160|`130de9e5c0e022309582afde7e66f79846cbcc93a5f20a51cf7afcc34b3a47bf`|
|terrain_water|terrain_water_01.png|160×160|`2ea055ed25a0a9a41f603c30793854ceba0e9bfc00993bb9b266b0d31865bcaa`|


## 2方向素材の登録

- 原画の保存先は [`docs/monster-wars/art-originals/directional/`](art-originals/directional)。
- 組込候補の保存先は [`apps/monster-wars/art/directional/`](../../apps/monster-wars/art/directional)。現在の `art.ts` の `art/formal/*.webp` 取り込み範囲から外した専用ディレクトリ。ゲーム本体へ接続する際に明示的に参照する。
- `K01`、`K03`、`K04`、`helicopter` は現行のモデルID。`regel`、`velza`、`lightHeli` は素材キー。正式モデルIDは未確定（#206の `trialRegel`、`trialVelza`、`trialLightHeli` は検証用）。
- 原画PNGは添付とバイト単位で同一。WebPは原寸でα8以上の外接矩形に8pxずつ透過余白を加え、縦横比を保ってLanczosで縮小した。縮小前後のα8未満を0にし、WebPの品質85・アルファ品質100で保存した。ペアは共通の縮小率を使用し、標準攻撃ヘリNEのみ解像度差を補うためSEに対し原寸換算で1.16倍とした。照合には機体中央とローターハブを使用し、盤面の表示倍率は組込時に確定する。
- アンカーは各WebPの左上からの比率 (x, y)。地上は接地面の中心、空中は胴体中央を基準とした仮値。レジェルは1×2地上、K01/K03は1×1地上、K04と両ヘリは1×1空中。反転時のx座標は `1 - x` を起点とする。
- 採用・品質・実装の状態は[方向別画像制作・採用管理](directional-art-production.md#素材検査と実装準備)を参照。

| ファイル名の基部 | 添付 | 原画寸法 px | 原画バイト | WebP寸法 px | WebPバイト | 仮アンカー (x, y) |
|---|---|---:|---:|---:|---:|---|
| `regel-SE` | `7293.png` | 1254×1254 | 1,305,909 | 300×257 | 15,168 | (0.517, 0.757) |
| `regel-NE` | `7294.png` | 1254×1254 | 1,032,195 | 294×229 | 14,534 | (0.543, 0.668) |
| `velza-SE` | `7296.png` | 1312×1199 | 1,379,929 | — | — | — |
| `velza-NE` | `7297.png` | 1536×1024 | 1,195,922 | — | — | — |
| `K01-SE` | `7298.png` | 1448×1086 | 1,504,545 | 254×234 | 18,690 | (0.506, 0.761) |
| `K01-NE` | `7299.png` | 1448×1086 | 1,048,511 | 256×222 | 14,214 | (0.479, 0.706) |
| `K03-SE` | `7301.png` | 1447×1087 | 2,071,452 | 300×223 | 22,032 | (0.548, 0.801) |
| `K03-NE` | `7300.png` | 1448×1086 | 1,631,707 | 266×205 | 17,596 | (0.601, 0.694) |
| `K04-SE` | `7302.png` | 1448×1086 | 1,563,675 | 256×177 | 15,324 | (0.545, 0.578) |
| `K04-NE` | `7303.png` | 1448×1086 | 1,484,434 | 254×190 | 15,406 | (0.495, 0.485) |
| `lightHeli-SE` | `7304.png` | 1448×1086 | 1,345,905 | 256×176 | 13,600 | (0.58, 0.621) |
| `lightHeli-NE` | `7305.png` | 1448×1086 | 982,524 | 246×155 | 12,728 | (0.573, 0.459) |
| `helicopter-SE` | `7307.png` | 1448×1086 | 1,376,196 | 256×185 | 13,552 | (0.585, 0.636) |
| `helicopter-NE` | `7306.png` | 1254×1254 | 852,014 | 253×174 | 12,710 | (0.608, 0.4) |

| 原画PNGの基部 | SHA-256 |
|---|---|
| `regel-SE` | `d05db50f2b818c3be324f4b59f282c2b62989e4f75b2ff6dd7d3d7a755e0a634` |
| `regel-NE` | `00c16ef4d1441c262b07e605bfd6570b3b8c124c070a3cf738d8b3bd779d97ed` |
| `velza-SE` | `37fdccc897f1f3e71d955c30dd41a3e0c665448a166e61bf0f8b49ae8c0dd1f3` |
| `velza-NE` | `465f85bffc44303d91e506fac100f6437e3de9bdfbd0d25e026590ca22272564` |
| `K01-SE` | `c174f289bca91f2d9b510500fb863b6ec7bf1e990c53cb1e4d6a212ab314bcbc` |
| `K01-NE` | `996226d25dab04dd9dbfeaa8cb10116509cca1fe98625c1b4b9e81adcc19a2d5` |
| `K03-SE` | `bbfde7831838b4ba21651367846b74ee609c20142fd749980f676a3ef870472c` |
| `K03-NE` | `68ee0ee114a852ec4380cbcf6287bea5383955dee56526855a92f6fc28b47bd2` |
| `K04-SE` | `0b1b475e86fc73440f8c2485f146a64dd759c031e2aebd12c28b7cd38ef39c11` |
| `K04-NE` | `437596244944cdf68b20c49c635d26e1a92d13869e12b74f2634f72c7debefc5` |
| `lightHeli-SE` | `39536c9211d9822f518f7b6665dfad1ae0b6e285cb97bd018fc0abd7e0f1c993` |
| `lightHeli-NE` | `c769dbdd5a29fa66ce3c4dcbd4a28940457b17504487402a5c31692ad0c1533e` |
| `helicopter-SE` | `77384748ead1b0e01d823708b3820756672fdb9bdbee9b9e0eb17d8e31ef6dce` |
| `helicopter-NE` | `5312c5ac5b368da2c649886c13e7bd0113a00f5d0ad7a3b7dd8298990bbcd6e2` |


### 第2弾 地上車両

保存先と命名は上記に準拠。原画14枚・候補WebP 13枚。`apc`、`aa`、`lightArt`、`heavyArt`、`repair`、`supply` は現行モデルID。`kaijuTank` は正式モデルID確定までの素材キー（#206 の `trialKaijuTank` は検証用ID）。

加工方法は上記と同じ。ペアの縮尺は砲身・クレーンの外接寸法に依存しないよう車体・足回りの投影サイズを目視で照合し、NEの原寸換算倍率を対怪獣戦車0.95、標準装甲車1.05、対空機関砲車0.97、軽自走砲1.00、重自走砲1.12、補給車1.11とした。1×2の2車種は最長辺360pxを基準にし、1×1は256〜272pxを基準にした。アンカーは車輪または履帯の接地面中心を仮置きした。盤面の実表示は組込時に調整する。

| ファイル名の基部 | 添付 | 原画寸法 px | 原画バイト | WebP寸法 px | WebPバイト | 仮アンカー (x, y) |
|---|---|---:|---:|---:|---:|---|
| `kaijuTank-SE` | `7308.png` | 1254×1254 | 2,052,324 | 360×334 | 30,382 | (0.52, 0.792) |
| `kaijuTank-NE` | `7309.png` | 1254×1254 | 2,094,566 | 340×299 | 32,704 | (0.515, 0.757) |
| `apc-SE` | `7311.png` | 1254×1254 | 2,103,289 | 256×248 | 17,278 | (0.523, 0.801) |
| `apc-NE` | `7310.png` | 1254×1254 | 1,859,750 | 255×204 | 19,324 | (0.526, 0.739) |
| `aa-SE` | `7339.png` | 1254×1254 | 2,145,964 | 237×256 | 19,916 | (0.502, 0.79) |
| `aa-NE` | `7340.png` | 1254×1254 | 2,245,447 | 238×243 | 21,174 | (0.512, 0.77) |
| `lightArt-SE` | `7329.png` | 1448×1086 | 1,661,404 | 267×260 | 21,212 | (0.503, 0.79) |
| `lightArt-NE` | `7332.png` | 1448×1086 | 1,510,502 | 272×269 | 19,964 | (0.503, 0.782) |
| `heavyArt-SE` | `7333.png` | 1448×1086 | 2,038,793 | 360×312 | 33,262 | (0.504, 0.806) |
| `heavyArt-NE` | `7334.png` | 1448×1086 | 1,495,012 | 323×348 | 28,858 | (0.486, 0.814) |
| `repair-SE` | `7336.png` | 1448×1086 | 2,405,932 | 256×214 | 21,888 | (0.504, 0.775) |
| `repair-NE` | `7335.png` | 1448×1086 | 2,059,419 | 保留 | — | — |
| `supply-SE` | `7338.png` | 1447×1087 | 2,605,932 | 256×195 | 17,676 | (0.514, 0.785) |
| `supply-NE` | `7337.png` | 1447×1087 | 2,111,400 | 252×213 | 19,120 | (0.505, 0.786) |

| 原画PNGの基部 | SHA-256 |
|---|---|
| `kaijuTank-SE` | `ff1d66b99fddeaa16ab2bb5d1ad3f6118ba5c9bd2d1a5edf8a463f5f98d5372d` |
| `kaijuTank-NE` | `acf7a7556a18609f0dd1c9ae4e6a5c4f5a1acebb6f9f1239bd13978ece57d34e` |
| `apc-SE` | `575eaa9d7226efefc4e199d1194dc9adf90c3c7f7dd73459cf577e2d3ae41c76` |
| `apc-NE` | `a41975cd3466130cb8ef624b17907f40c6de7e3acafd1f094b8e3d819b1c8b6c` |
| `aa-SE` | `51e277044a70fa1671b8a8592c0c72694e804b9c3e9d9efeb45f1a22dc1ff1d7` |
| `aa-NE` | `3a7ded2c0512fa16265f6712cad209928c9b9f2748cc2976633f9687646605f5` |
| `lightArt-SE` | `3fb6d045342a25cf0e956170551a8f8df534bbe676ae93d227746a226aff4b43` |
| `lightArt-NE` | `6a7ff8df450a377eeb9465ae648dfc60e08fce9cfff28bbfc3ff0c84820cd275` |
| `heavyArt-SE` | `dabf300437022d193d921acc70c96793cfcb9dba9e11d9219eaada422402a76a` |
| `heavyArt-NE` | `2558cee0948432aab6dc3ba3e219723f868121b79358ac8385e8253e2ae02fd6` |
| `repair-SE` | `2db662ff7529aa430b13d898d4a9a4b0e32c45d632df042d88b6720d2f0c2a3c` |
| `repair-NE` | `599ca7b4c06231bec7189634eecc5d6450c1843049bcd18d9b9c698b96c72fc8` |
| `supply-SE` | `285d903c2ff024015bfa17760a17cf9b3cc246f15af01d09185a6ffca986ac9e` |
| `supply-NE` | `c2ab60e34e738a9382a0e37bf3aa354c4c5c16c3e6b5db611bacbec525c25d3a` |


### 第3弾 歩兵・工兵

保存先と命名は上記に準拠。6モデル・SE/NE原画12枚とWebP 12枚。 `infantry` と `sniper` は現行モデルID。`assault`、`machineGun`、`rocket`、`engineer` は正式モデルID確定までの素材キー（#206 の `trialAssault`、`trialMG`、`trialRocket`、`trialEngineer` は検証用）。

前回と同じα8しきい値・原寸8px余白・Lanczos縮小・透過WebPを採用。人物の頭部・胴体を基準に原寸の23%を共通ベースとし、NEに順に1.05・1.06・1.04・1.05・1.03・1.06倍の微調整を行った。仮アンカーは装備の張り出しを除いた小隊の足元を基準に置いた。盤面の1×1表示倍率と接地は組込時に再確認する。

| ファイル名の基部 | 添付 | 原画寸法 px | 原画バイト | WebP寸法 px | WebPバイト | 仮アンカー (x, y) |
|---|---|---:|---:|---:|---:|---|
| `infantry-SE` | `7342.png` | 1448×1086 | 1,479,952 | 261×240 | 21,734 | (0.489, 0.8) |
| `infantry-NE` | `7341.png` | 1448×1086 | 1,266,161 | 216×251 | 19,894 | (0.488, 0.757) |
| `assault-SE` | `7343.png` | 1312×1199 | 1,862,422 | 280×266 | 26,440 | (0.504, 0.745) |
| `assault-NE` | `7344.png` | 1254×1254 | 1,419,668 | 272×291 | 24,276 | (0.457, 0.74) |
| `machineGun-SE` | `7346.png` | 1254×1254 | 2,086,721 | 270×279 | 27,588 | (0.486, 0.794) |
| `machineGun-NE` | `7345.png` | 1312×1199 | 1,598,421 | 290×269 | 25,932 | (0.433, 0.776) |
| `rocket-SE` | `7348.png` | 1254×1254 | 2,063,531 | 277×281 | 27,088 | (0.503, 0.804) |
| `rocket-NE` | `7347.png` | 1312×1199 | 1,775,738 | 288×282 | 26,836 | (0.482, 0.789) |
| `sniper-SE` | `7350.png` | 1254×1254 | 2,254,767 | 286×288 | 28,876 | (0.461, 0.778) |
| `sniper-NE` | `7349.png` | 1312×1199 | 1,793,846 | 306×276 | 27,100 | (0.466, 0.785) |
| `engineer-SE` | `7352.png` | 1254×1254 | 2,283,843 | 274×280 | 30,788 | (0.508, 0.822) |
| `engineer-NE` | `7351.png` | 1312×1199 | 1,788,990 | 295×290 | 28,070 | (0.502, 0.771) |

| 原画PNGの基部 | SHA-256 |
|---|---|
| `infantry-SE` | `d8734a3d53f1ca4b0c51e17b1b03c5a0df4c0d3a83f721a935a03d2b45141080` |
| `infantry-NE` | `b9aa5ce6b0302809019c629d22ed0078f23ace6e75b3d4a32010d20682d1ab66` |
| `assault-SE` | `532f92efbc5b85c090438d47a12eadc49027e86850d761a18d7ba2ec08de313a` |
| `assault-NE` | `182d4284ea3227e4308968151548156df1f34bb464edc1352e453278001b55ad` |
| `machineGun-SE` | `b09a89562ff56c86b34037773ad27f666fb261421da23a8a633bc55065a9f028` |
| `machineGun-NE` | `724bde272719eef7d27fa1ea5936ef123c21326006587e7e42fa1d6749fb340b` |
| `rocket-SE` | `cadf08238acdb19a6e58038f4f033d01f4b6e0e2428212b58ba92554f798e481` |
| `rocket-NE` | `406a7aec19a8197e402d834458434b7cc1f36bce59bf8cff2086ba4a3656fd55` |
| `sniper-SE` | `9499d65c4c69e4a67a1f72fc025d28569d524f1ac10c334659a12c087e987d17` |
| `sniper-NE` | `942f93e4e1fbaa9994696be9615e369617e9cfdacba0d2b51f9fc7af502ff5c3` |
| `engineer-SE` | `2611b082eb9b89a0ff0ecccd93901114f375b30d2000481aaa457161447a136d` |
| `engineer-NE` | `b99443949b776130d38adb0d8ce93d0f93b4c3e8a806909cad25bd3910b130f4` |
