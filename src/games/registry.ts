import { GameRegistry } from "./core/GameRegistry";
import { ponInaiGameModule } from "./pon-inai/module";
import { commercialHubGameModule } from "./commercial-hub/module";
import { ooishiTerritoryGameModule } from "./ooishi-territory/module";
import { ooishiTerritory2GameModule } from "./ooishi-territory-2/module";

export const gameRegistry = new GameRegistry();
gameRegistry.register(ponInaiGameModule);
gameRegistry.register(commercialHubGameModule);
gameRegistry.register(ooishiTerritoryGameModule);
gameRegistry.register(ooishiTerritory2GameModule);
