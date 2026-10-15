import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BidPanel, BidStatus } from "../../../src/client/games/commercial-hub/BidPanel";
import { InvestmentPanel } from "../../../src/client/games/commercial-hub/InvestmentPanel";
import { NextOpportunityRules } from "../../../src/client/games/commercial-hub/NextOpportunityRules";
import type { HubClientAction } from "../../../src/games/commercial-hub/state";
import type { HubView } from "../../../src/games/commercial-hub/view";
import "../../../src/client/games/commercial-hub/commercial-hub.css";
declare global {
  interface Window {
    __work2Initial: HubView;
    __work2Dispatch: (action: HubClientAction) => Promise<HubView>;
    __work2SetView: (view: HubView) => void;
  }
}
function Work2() {
  const [view, setView] = useState(window.__work2Initial);
  const [expandedProject, expandProject] = useState<string | null>(null);
  window.__work2SetView = setView;
  const props = { view, name: (id: string) => id, act: (action: HubClientAction) => { void window.__work2Dispatch(action).then(setView); } };
  return <div className="hub" style={{ maxWidth: 1100, margin: "auto" }}>
    <NextOpportunityRules/>
    <section className="hub-card" aria-label="商機一覧"><h2>{view.cityCondition.name} · {view.opportunities.length}トリック</h2>
      <ol>{view.opportunities.map((o, i) => <li key={i}>{o.name}</li>)}</ol>
    </section>
    <BidStatus {...props}/>
    <section aria-label="現在の操作">{view.phase === "BID" ? <BidPanel {...props}/> : view.phase === "INVESTMENT"
      ? <InvestmentPanel {...props} expandedProject={expandedProject} expandProject={expandProject} highlight={() => {}}/>
      : <p>ビッドが確定しました。</p>}</section>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Work2/>);

