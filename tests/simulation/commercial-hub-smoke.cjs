const assert=require('node:assert/strict');
const {SeededRandom}=require('../../dist-smoke/games/pon-inai/random.js');
const {createDeck,dealHands,legalCards,playCard,trickRanking,clockwisePlayer}=require('../../dist-smoke/games/commercial-hub/cards.js');
const {createHubState,startRound}=require('../../dist-smoke/games/commercial-hub/engine.js');
const players=['A','B','C','D']; let tricks=0;
for(let seed=1;seed<=250;seed++) {
 const rng=new SeededRandom(seed),s=createHubState('sim',players,rng);
 for(let round=1;round<=6;round++) {
  if(round>1){s.round=round;startRound(s,rng);}
  const hands=structuredClone(s.playerHands);
  for(const opportunity of s.opportunities) {
   const played=[];
   for(let i=0;i<4;i++){const p=clockwisePlayer(players,s.trickLeader,i),choices=legalCards(hands[p],played[0]?.card.suit??null),card=choices[rng.integer(0,choices.length-1)];hands[p]=playCard(hands[p],card,played[0]?.card.suit??null);played.push({playerId:p,card});}
   assert.equal(new Set(trickRanking(played,opportunity.trump)).size,4);s.trickLeader=clockwisePlayer(players,s.trickLeader);tricks++;
  }
  assert.equal(Object.values(hands).flat().length,0);
 }
 assert.equal(new Set(s.marketUsed).size,5);
}
console.log(`Commercial Hub v0.3: 250 opening/market cycles, ${tricks} tricks passed`);
