import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LineAction, LineState } from "../../../src/games/ooishi-line/engine";
import { LineGame } from "../../../src/client/games/ooishi-line/LineGame";
import "../../../src/client/styles.css";

declare global { interface Window {
  __lineFixtureState: () => Promise<LineState>;
  __lineFixtureAction: (action: LineAction) => Promise<LineState>;
  __lineFixtureRestart: () => Promise<LineState>;
} }

function Fixture() {
  const [state, setState] = useState<LineState | null>(null);
  useEffect(() => { void window.__lineFixtureState().then(setState); }, []);
  return <main className="page">{state && <LineGame state={state}
    onAction={action => { void window.__lineFixtureAction(action).then(setState); }}
    onRestart={() => { void window.__lineFixtureRestart().then(setState); }} onExit={() => {}} />}</main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
