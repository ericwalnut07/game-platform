import { SUIT_NAMES } from "../../../games/commercial-hub/data";
import { openingReward } from "../../../games/commercial-hub/opportunities";
import { SUITS } from "../../../games/commercial-hub/types";
import { resourceText } from "./labels";
import { SuitMark } from "./SuitMark";

export function OpeningRewards() {
  return <div className="hub-opening-rewards"><table><caption>開業商機の順位報酬</caption><thead><tr><th>系統</th><th>1位</th><th>2位</th></tr></thead><tbody>{SUITS.map((suit) => <tr key={suit}><th scope="row"><SuitMark suit={suit} size={18}/>{SUIT_NAMES[suit]}</th>{[1, 2].map((place) => <td key={place}>{resourceText(openingReward(suit, place))}</td>)}</tr>)}</tbody></table><p>全系統共通：3位は資金1、4位は報酬なし。トリック直後に獲得します。</p></div>;
}
