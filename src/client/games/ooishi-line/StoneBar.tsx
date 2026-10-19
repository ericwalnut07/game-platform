import type { LineSeat, LineStoneSize } from "../../../games/ooishi-line/position";

export const LINE_SIZE_NAMES: Record<LineStoneSize, string> = { large: "大", medium: "中", small: "小" };

/** Line-specific until Caravan demonstrates which presentation can be shared. */
export function StoneBar({ size, owner, label = true }: { size: LineStoneSize; owner: LineSeat; label?: boolean }) {
  return <span aria-hidden="true" className={"line-stone line-stone--" + size + " line-owner--" + owner}>
    {label && LINE_SIZE_NAMES[size]}
  </span>;
}
