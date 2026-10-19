import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CaravanAction, CaravanState } from "../../../src/games/ooishi-caravan/engine";
import { CaravanGame } from "../../../src/client/games/ooishi-caravan/CaravanGame";
import "../../../src/client/styles.css";

declare global { interface Window {
  __caravanFixtureState: () => Promise<CaravanState>;
  __caravanFixtureAction: (action: CaravanAction) => Promise<CaravanState>;
  __caravanFixtureRestart: () => Promise<CaravanState>;
} }
function Fixture() {
  const [state, setState] = useState<CaravanState | null>(null);
  useEffect(() => { void window.__caravanFixtureState().then(setState); }, []);
  return <main className="page">{state && <CaravanGame state={state}
    onAction={action => { void window.__caravanFixtureAction(action).then(setState); }}
    onRestart={() => { void window.__caravanFixtureRestart().then(setState); }} onExit={() => {}} />}</main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
