import type { PropsWithChildren } from "react";
import { APP_VERSION } from "../../shared/version";
import { navigate } from "../lib/router";

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand-button" onClick={() => navigate("/")}>GAME PORT</button>
        <span className="site-tagline">みんなで遊べる自作ゲームサイト</span>
        <span className="header-spacer" />
        <a className="header-link" href="/#/rules" target="_blank" rel="noreferrer">ルール</a>
        <span className="version-badge">v{APP_VERSION}</span>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
