import { useEffect, useState } from "react";

export interface RouteState {
  path: string;
  parts: readonly string[];
}

function readRoute(): RouteState {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const path = hash.startsWith("/") ? hash : `/${hash}`;
  return { path, parts: path.split("/").filter(Boolean) };
}

export function useHashRoute(): RouteState {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const listener = () => setRoute(readRoute());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
}
