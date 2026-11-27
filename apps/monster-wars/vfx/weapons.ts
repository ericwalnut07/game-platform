import type { Picture } from './timeline';

export type Pattern='P01'|'P02'|'P03'|'P04'|'P05'|'P06'|'P07'|'P08'|'P09'|'P10'|'P11'|'P12';
type WeaponEffect={
  pattern:Pattern; duration:number; muzzle?:Picture; strength?:number;
  arc?:number; impact?:number; beam?:number; breakArmor?:boolean;
};

export const weaponEffects:Readonly<Partial<Record<string,WeaponEffect>>>=Object.freeze({
  rifle:{pattern:'P01',muzzle:'VFX01',duration:320},
  aa:{pattern:'P01',muzzle:'VFX01-M',duration:420},
  helicopter:{pattern:'P01',muzzle:'VFX01-M',duration:370},
  tank:{pattern:'P03',muzzle:'VFX02',duration:560},
  lightArt:{pattern:'P05',muzzle:'VFX02',duration:690},
  charge:{pattern:'P09',duration:520},dive:{pattern:'P09',duration:460},
  lineRay:{pattern:'P11',duration:630},headRay:{pattern:'P11',duration:790},
  W01:{pattern:'P01',muzzle:'VFX01-M',duration:340,strength:1.12},
  cannon:{pattern:'P01',muzzle:'VFX01-M',duration:360,strength:1.18},
  W04:{pattern:'P01',muzzle:'VFX01-M',duration:395,strength:1.4},
  sniper:{pattern:'P02',muzzle:'VFX01-M',duration:355},
  W06:{pattern:'P02',muzzle:'VFX01-M',duration:390,strength:1.35},
  heavy:{pattern:'P03',muzzle:'VFX02',duration:600,strength:1.28},
  W09:{pattern:'P03',muzzle:'VFX02',duration:530,impact:128,breakArmor:true},
  W11:{pattern:'P03',muzzle:'VFX02',duration:560,breakArmor:true},
  W13:{pattern:'P04',duration:650,impact:260,arc:.45,strength:1.16},
  W14:{pattern:'P04',duration:570,impact:198,arc:.8},
  W16:{pattern:'P04',duration:625,impact:235,arc:.56,strength:1.22},
  heavyArt:{pattern:'P05',muzzle:'VFX02',duration:740,arc:2.1,strength:1.2},
  W18:{pattern:'P05',duration:585,impact:225,arc:1.1,strength:.76},
  W19:{pattern:'P05',muzzle:'VFX02',duration:650,arc:.95,strength:1.12},
  W20:{pattern:'P05',muzzle:'VFX02',duration:760,arc:2,strength:.83},
  W26:{pattern:'P06',duration:495,impact:160},
  W30:{pattern:'P07',muzzle:'VFX01',duration:435},
  claw:{pattern:'P08',duration:375,strength:.76},
  shellClaw:{pattern:'P08',duration:410},
  airClaw:{pattern:'P08',duration:380,strength:.9},
  gClaw:{pattern:'P08',duration:485,strength:1.4},
  stomp:{pattern:'P10',duration:540,strength:1.45,impact:240},
  sweepL:{pattern:'P10',duration:495},
  sweepR:{pattern:'P10',duration:495},
  ray:{pattern:'P11',duration:515,beam:.17},
  warningRay:{pattern:'P11',duration:830,beam:.31},
  repair:{pattern:'P12',duration:425,strength:1.14},
  W46:{pattern:'P12',duration:390,strength:.85},
  supply:{pattern:'P12',duration:415,strength:1.12},
  W47:{pattern:'P12',duration:380,strength:.82},
  W45:{pattern:'P12',duration:410},
});
