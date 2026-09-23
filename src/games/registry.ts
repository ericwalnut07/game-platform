import { GameRegistry } from "./core/GameRegistry";
import { ponInaiGameModule } from "./pon-inai/module";
import { commercialHubGameModule } from "./commercial-hub/module";

export const gameRegistry = new GameRegistry();
gameRegistry.register(ponInaiGameModule);
gameRegistry.register(commercialHubGameModule);
