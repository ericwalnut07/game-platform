import "./stacked-stones.css";

// Presentation types only. Each game's Core remains responsible for legality.
export type StoneSize = "large" | "medium" | "small";
export type StoneOwner = 0 | 1;
export interface StackStone { readonly size: StoneSize; readonly owner: StoneOwner }
export const STONE_SIZE_NAMES: Record<StoneSize, string> = { large: "大", medium: "中", small: "小" };

export function StoneBar({ size, owner, label = true }: StackStone & { label?: boolean }) {
  return <span aria-hidden="true" className={"ooishi-stone ooishi-stone--" + size + " ooishi-owner--" + owner}>
    {label && STONE_SIZE_NAMES[size]}
  </span>;
}

export function PlayerColor({ owner }: { owner: StoneOwner }) {
  return <i aria-hidden="true" className={"ooishi-player-color ooishi-owner--" + owner} />;
}

/** Stack order is bottom to top; selecting a layer carries that layer and all above it. */
export function StackView({ stones, selectedLayer = null, destinationActive = false, canSelect, describeStone, onSelect }: {
  stones: readonly StackStone[];
  selectedLayer?: number | null;
  destinationActive?: boolean;
  canSelect: (stone: StackStone, layer: number) => boolean;
  describeStone: (stone: StackStone, layer: number) => string;
  onSelect: (layer: number) => void;
}) {
  return <div className={"ooishi-stack" + (destinationActive ? " ooishi-stack--destination" : "")}>
    {stones.map((stone, layer) => <button type="button" key={layer}
      data-owner={stone.owner} data-layer={layer} data-size={stone.size}
      className={"ooishi-piece-target" + (selectedLayer !== null && layer >= selectedLayer ? " ooishi-piece-target--carried" : "")}
      disabled={destinationActive || !canSelect(stone, layer)}
      aria-label={describeStone(stone, layer)} aria-pressed={selectedLayer === layer}
      onClick={() => onSelect(layer)}>
      <StoneBar size={stone.size} owner={stone.owner} label={layer === stones.length - 1} />
    </button>)}
  </div>;
}
