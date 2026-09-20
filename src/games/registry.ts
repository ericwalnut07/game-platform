import { GameRegistry } from "./core/GameRegistry";
import { ponInaiGameModule } from "./pon-inai/module";

export const gameRegistry = new GameRegistry();
gameRegistry.register(ponInaiGameModule);
