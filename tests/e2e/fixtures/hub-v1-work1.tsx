import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CityBoard, type MapHighlight } from "../../../src/client/games/commercial-hub/CityBoard";
import { InvestmentPanel } from "../../../src/client/games/commercial-hub/InvestmentPanel";
import { IncomePanel } from "../../../src/client/games/commercial-hub/IncomePanel";
import type { HubClientAction } from "../../../src/games/commercial-hub/state";
import type { HubView } from "../../../src/games/commercial-hub/view";
import "../../../src/client/games/commercial-hub/commercial-hub.css";

declare global {
  interface Window {
    __work1Initial: HubView;
    __work1Dispatch: (action: HubClientAction) => Promise<HubView>;
    __work1SetView: (view: HubView) => void;
  }
}
// Test-only view harness: real panels and authoritative reducer in the test
// runner. No production route, room option, or server mutation endpoint.
function Work1() {
  const [view, setView] = useState(window.__work1Initial);
  const [highlight, setHighlight] = useState<MapHighlight>({ district: null, suit: null });
  const [mapTarget, setMapTarget] = useState<Parameters<typeof InvestmentPanel>[0]["mapTarget"]>(null);
  window.__work1SetView = setView;
  const props = { view, name: (id: string) => id, act: (action: HubClientAction) => { void window.__work1Dispatch(action).then(setView); } };
  return <div className="hub" style={{ maxWidth: 1100, margin: "auto" }}>
    <CityBoard {...props} highlight={highlight} selectTarget={(district, buildingId) => setMapTarget({ district, buildingId, seq: (mapTarget?.seq ?? 0) + 1 })}/>
    <section aria-label="建物操作">{view.phase === "INVESTMENT"
      ? <InvestmentPanel {...props} highlight={setHighlight} expandedProject={null} expandProject={() => {}} mapTarget={mapTarget}/>
      : <IncomePanel {...props}/>}</section>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Work1/>);
