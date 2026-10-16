import type { Resources } from "../../../games/commercial-hub/types";
import { RESOURCE_NAMES } from "./labels";
export function ResourcePreview({ before, after, label = "資源の変化" }: { before: Resources; after: Resources; label?: string }) {
  return <table className="hub-resource-preview" aria-label={label}><caption>{label}（即時）</caption><thead><tr>{(["cash", "materials", "goods"] as const).map(k => <th key={k}>{RESOURCE_NAMES[k]}</th>)}</tr></thead><tbody><tr>{(["cash", "materials", "goods"] as const).map(k => <td key={k} className={after[k] < 0 ? "hub-deficit" : ""}>{before[k]} → <strong>{after[k]}</strong></td>)}</tr></tbody></table>;
}
