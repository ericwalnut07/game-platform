import type { PropsWithChildren } from "react";
import { navigate } from "../lib/router";

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand-button" onClick={() => navigate("/")}>GAME PORT</button>
        <span className="site-tagline">みんなで遊べる自作ゲームサイト</span>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
