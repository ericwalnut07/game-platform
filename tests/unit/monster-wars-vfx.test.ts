import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import manifest from '../../apps/monster-wars/vfx/manifest.json';
import { timeline } from '../../apps/monster-wars/vfx/timeline';
import { trial, trials } from '../../apps/monster-wars/vfx/trial';

test('the nine registered sprite sheets match their hashes and RGBA dimensions',()=>{
  expect(manifest).toHaveLength(9);
  for(const m of manifest){
    const png=readFileSync('apps/monster-wars/vfx/'+m.file);
    expect(createHash('sha256').update(png).digest('hex')).toBe(m.sha256);
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual(m.size);
    expect(png[25]).toBe(6);
    expect(m.rows*m.columns).toBe(m.frames);
    expect([m.columns*m.frameSize,m.rows*m.frameSize]).toEqual(m.size);
  }
});

test('each preview executes a real Core attack and all four layer routes are represented',()=>{
  const weapons=new Set<string>(),routes=new Set<string>();
  for(const spec of trials){
    const {before,after}=trial(spec);
    expect(after,spec.weapon).not.toBeNull();
    const action=after!.events!.find(e=>e.kind==='attack');
    expect(action?.weapon).toBe(spec.weapon);
    if(!action)continue;
    weapons.add(action.weapon);
    routes.add(action.sourceLayer+'→'+action.layer);
    const state=structuredClone(after);
    const normal=timeline(before,after!,'normal');
    const fast=timeline(before,after!,'fast');
    const simple=timeline(before,after!,'simple');
    expect(normal.attacks[0]?.weapon).toBe(spec.weapon);
    expect(normal.effects.length).toBeGreaterThan(0);
    expect(simple.effects.every(e=>!['EF01','EF04','EF05','EF06','EF12','EF13'].includes(e.id))).toBe(true);
    expect(timeline(before,after!,'off').duration).toBe(0);
    expect(fast).toEqual(normal);
    expect(after).toEqual(state);
    if(action.layer==='air')expect(normal.effects.filter(e=>e.layer==='air').some(e=>e.id==='EF13'||e.id==='EF12')).toBe(false);
    if(spec.weapon==='rifle')expect(normal.effects.filter(e=>e.id==='EF04')).toHaveLength(action.strikes);
    if(spec.weapon==='charge')expect(after!.events!.some(e=>e.kind==='move'&&e.forced&&e.to[1]===4)).toBe(true);
    if(spec.weapon==='lineRay')expect(normal.effects.filter(e=>e.id==='EF06').map(e=>e.layer)).toEqual(['ground','air']);
    if(spec.weapon==='headRay')expect(action.sourceLayer).toBe('air');
  }
  expect(weapons.size).toBe(9);
  expect(routes.size).toBe(4);
});
