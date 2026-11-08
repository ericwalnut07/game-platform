import {robotArtPlacement,robotBodyArtSources,robotPortraitArtUrl,robotArtPaletteFilter,robotWeaponArtUrl,type RobotArtPalette,type RobotWeaponArtFamily,type RobotArtFacing} from "./RobotVisualArt";
import {robotRearArtUrl} from "./RobotRearArt";
const ns="http://www.w3.org/2000/svg";
/** Successfully decoded body images remain valid across presentation-only redraws.
 * Otherwise every button press briefly exposes the blue/green/red SVG fallback
 * while the new <image> fires its onload callback. This set is in-memory only. */
const decodedBodySources = new Set<string>();
/** Read-only rendering of registered art. Caller owns HP, identity, selection and hit areas. */
export function createRobotVisualSprite(doc:Document,options:{
  readonly frameId:string;readonly palette:RobotArtPalette;readonly weaponFamily:RobotWeaponArtFamily|null;
  readonly slot:1|2;readonly fallback:SVGElement;readonly portrait?:boolean;
  /** Battle map only. Portrait/customization and enemies stay front-facing. */
  readonly facing?:RobotArtFacing;
  /** Presentation overrides allow offline loading/error tests without changing any game state. */
  readonly bodySources?:readonly string[];readonly weaponSource?:string|null;
}):SVGGElement {
  const node=<K extends keyof SVGElementTagNameMap>(tag:K,attrs:Record<string,string|number>={})=>{const e=doc.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const facing=options.facing??"front";
  const rear=facing==="right-rear"?robotRearArtUrl(options.frameId):null;
  const layout=robotArtPlacement(options.frameId,rear?"right-rear":"front"),root=node("g",{"data-robot-art":layout.key??"fallback","data-frame-id":options.frameId,"data-palette":options.palette,"data-art-facing":rear?"right-rear":"front","pointer-events":"none","aria-hidden":"true"});
  const sources=options.bodySources??[...new Set([rear,...robotBodyArtSources(options.frameId,options.portrait)].filter((url):url is string=>url!==null))];
  root.dataset.artStatus="fallback";root.append(options.fallback);options.fallback.classList.add("robot-art-fallback");
  if(!sources.length)return root;
  const raster=node("g",{visibility:"hidden"}),body=node("image",{...layout.body,class:"robot-unit-art",preserveAspectRatio:"xMidYMid meet",style:`filter: ${robotArtPaletteFilter(options.palette)}`});
  raster.append(body);root.append(raster);let index=0;
  const showBody = (decoded: boolean) => {
    options.fallback.setAttribute("visibility", "hidden");
    raster.removeAttribute("visibility");
    root.dataset.artStatus = decoded ? "loaded" : "loading";
    if(decoded)root.dataset.artResolution=rear&&sources[index]===rear?"right-rear":sources[index]===robotPortraitArtUrl(options.frameId)&&options.portrait?"portrait":"map";
    else delete root.dataset.artResolution;
  };
  const showFallback = () => {
    raster.setAttribute("visibility", "hidden");
    options.fallback.removeAttribute("visibility");
    root.dataset.artStatus = "fallback";
    delete root.dataset.artResolution;
  };
  const selectBody = () => {
    const source = sources[index]!;
    const decoded = decodedBodySources.has(source);
    // The approved body PNG/WebP is embedded in this offline HTML. Show the
    // raster directly even on its first decode; only reveal the colored fallback
    // if the registered image actually fails. Explicit override sources keep
    // their original visible-fallback loading behavior for failure diagnostics.
    if(decoded || options.bodySources===undefined && /^data:image\/(?:png|webp);base64,/.test(source))showBody(decoded);
    else showFallback();
  };
  body.onload=()=>{decodedBodySources.add(sources[index]!);showBody(true);};
  body.onerror=()=>{decodedBodySources.delete(sources[index]!);index++;if(index<sources.length){selectBody();body.setAttribute("href",sources[index]!);return;}showFallback();};
  const family=options.weaponFamily,weapon=node("g",{"data-weapon-family":family??"none","data-equipped-slot":options.slot,"data-weapon-status":"unregistered",transform:`translate(${layout.hand.x} ${layout.hand.y}) rotate(${layout.weapon.angle})`});
  raster.append(weapon);
  const url=options.weaponSource===undefined?family&&robotWeaponArtUrl(family):options.weaponSource;
  if(url){const image=node("image",{x:-layout.weapon.width*layout.weapon.gripX,y:-layout.weapon.height*layout.weapon.gripY,width:layout.weapon.width,height:layout.weapon.height,href:url,class:"robot-weapon-art",preserveAspectRatio:"xMidYMid meet"});image.onload=()=>{weapon.dataset.weaponStatus="loaded";};image.onerror=()=>{image.remove();weapon.dataset.weaponStatus="fallback";};weapon.append(image);}
  // No substitute weapon design is invented when the approved weapon PNG is absent.
  selectBody();body.setAttribute("href",sources[0]!);return root;
}
