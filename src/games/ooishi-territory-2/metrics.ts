import { calculateTerritory2Board, territory2StateConfig, type Territory2State } from "./engine";
/** Public, reproducible diagnostics; excludes display names and session data. */
export function territory2Participants(state: Territory2State) {
  return {
    humanCount: state.players.filter(p=>!p.controller).length,
    npcCount: state.players.filter(p=>p.controller).length,
    controllers: state.players.map((p,seat)=>({seat, kind:p.controller ? "NPC" : "HUMAN", difficulty:p.controller?.profile ?? null})),
  };
}
export function territory2MatchMetrics(state: Territory2State) {
  const config = territory2StateConfig(state);
  let before = calculateTerritory2Board(config,[]);
  const syncActivations = Array<number>(config.playerCount).fill(0);
  const gpCreated = Array<number>(config.playerCount).fill(0);
  const piercingCreated = Array<number>(config.playerCount).fill(0);
  const bigTurns = Array.from({length:config.playerCount},()=>[] as number[]);
  const opponentControlRemoved = Array.from({length:config.playerCount},()=>Array<number>(config.playerCount).fill(0));
  state.moves.forEach((move,index)=>{
    const after = calculateTerritory2Board(config,state.moves.slice(0,index+1));
    if(move.kind==="big")bigTurns[move.seat]!.push(Math.floor(index/config.playerCount)+1);
    for(let seat=0;seat<config.playerCount;seat++) {
      syncActivations[seat]! += after.syncBigIndexes.filter(cell=>after.occupants[cell]!.seat===seat&&!before.syncBigIndexes.includes(cell)).length;
      const oldLines=new Set(before.lines.filter(l=>l.side===seat).map(l=>l.start+":"+l.end));
      gpCreated[seat]! += after.lines.filter(l=>l.side===seat&&!oldLines.has(l.start+":"+l.end)).length;
      const oldPiercing=new Set(before.lines.filter(l=>l.side===seat&&l.piercing).map(l=>l.start+":"+l.end));
      piercingCreated[seat]! += after.lines.filter(l=>l.side===seat&&l.piercing&&!oldPiercing.has(l.start+":"+l.end)).length;
      if(seat!==move.seat)opponentControlRemoved[move.seat]![seat]! += Math.max(0,before.scores[seat]!-after.scores[seat]!);
    }
    before=after;
  });
  return { ...territory2Participants(state), connectionRange:config.connectionRange, maxBigStones:config.maxBigStones,
    bigTurns,syncActivations,gpCreated,piercingCreated,opponentControlRemoved };
}
