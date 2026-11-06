import {robotArtPlacement,robotBodyArtSources,robotPortraitArtUrl,robotArtPaletteFilter,robotWeaponArtUrl,type RobotArtPalette,type RobotWeaponArtFamily} from "./RobotVisualArt";
const ns="http://www.w3.org/2000/svg";
/** Read-only rendering of registered art. Caller owns HP, identity, selection and hit areas. */
export function createRobotVisualSprite(doc:Document,options:{
  readonly frameId:string;readonly palette:RobotArtPalette;readonly weaponFamily:RobotWeaponArtFamily|null;
  readonly slot:1|2;readonly fallback:SVGElement;readonly portrait?:boolean;
  /** Presentation overrides allow offline loading/error tests without changing any game state. */
  readonly bodySources?:readonly string[];readonly weaponSource?:string|null;
}):SVGGElement {
  const node=<K extends keyof SVGElementTagNameMap>(tag:K,attrs:Record<string,string|number>={})=>{const e=doc.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const layout=robotArtPlacement(options.frameId),root=node("g",{"data-robot-art":layout.key??"fallback","data-frame-id":options.frameId,"data-palette":options.palette,"pointer-events":"none","aria-hidden":"true"});
  const sources=options.bodySources??robotBodyArtSources(options.frameId,options.portrait);
  root.dataset.artStatus="fallback";root.append(options.fallback);options.fallback.classList.add("robot-art-fallback");
  if(!sources.length)return root;
  const raster=node("g",{visibility:"hidden"}),body=node("image",{...layout.body,class:"robot-unit-art",preserveAspectRatio:"xMidYMid meet",style:`filter: ${robotArtPaletteFilter(options.palette)}`});
  raster.append(body);root.append(raster);let index=0;
  body.onload=()=>{options.fallback.setAttribute("visibility","hidden");raster.removeAttribute("visibility");root.dataset.artStatus="loaded";root.dataset.artResolution=sources[index]===robotPortraitArtUrl(options.frameId)&&options.portrait?"portrait":"map";};
  body.onerror=()=>{index++;if(index<sources.length){body.setAttribute("href",sources[index]!);return;}raster.setAttribute("visibility","hidden");options.fallback.removeAttribute("visibility");root.dataset.artStatus="fallback";};
  const family=options.weaponFamily,weapon=node("g",{"data-weapon-family":family??"none","data-equipped-slot":options.slot,"data-weapon-status":"unregistered",transform:`translate(${layout.hand.x} ${layout.hand.y}) rotate(${layout.weapon.angle})`});
  raster.append(weapon);
  const url=options.weaponSource===undefined?family&&robotWeaponArtUrl(family):options.weaponSource;
  if(url){const image=node("image",{x:-layout.weapon.width*layout.weapon.gripX,y:-layout.weapon.height*layout.weapon.gripY,width:layout.weapon.width,height:layout.weapon.height,href:url,class:"robot-weapon-art",preserveAspectRatio:"xMidYMid meet"});image.onload=()=>{weapon.dataset.weaponStatus="loaded";};image.onerror=()=>{image.remove();weapon.dataset.weaponStatus="fallback";};weapon.append(image);}
  // No substitute weapon design is invented when the approved weapon PNG is absent.
  body.setAttribute("href",sources[0]!);return root;
}
