const numbered = (prefix:string,count:number) => Array.from({length:count},(_,i)=>prefix+String(i+1).padStart(2,'0'));
export const missionIdsOfficial = numbered('M',40);
export const officialDifficulties = ['easy','normal','hard','hardest','inferno'] as const;
export type OfficialDifficulty = typeof officialDifficulties[number];
export const officialWeaponIds = numbered('W',50);
export const officialEquipmentIds = numbered('P',40);
export const robotIds = numbered('R',20);
export const officialNewModels = {
  assault:'突撃歩兵',machineGun:'機関銃兵',lightHeli:'軽攻撃ヘリ',engineer:'修理工兵',
  rocket:'ロケット兵',kaijuTank:'対怪獣戦車',K27:'ヴェルザ',K28:'バルフレア',K29:'レジェル',
} as const;
export const officialAssetKeys = {K27:'velza',K28:'balflare',K29:'regel'} as const;
export const playableOfficialIds = ['M01','M02'] as const;
export const officialMissionIndex = (id:string) => playableOfficialIds.findIndex(value=>value===id);
export const isOfficialMissionId = (id:string) => missionIdsOfficial.includes(id);

export const officialFixedWeapons = [
  'shotgun','machineGun','lightHeliGun','engineerGun','engineerRepair','rocketLauncher','kaijuCannon',
  'velzaStrike','balflareHeatShot','balflareFlame','regelStrike',
] as const;
export const meritId = (model:string,index:number)=>model+':'+String(index+1);
