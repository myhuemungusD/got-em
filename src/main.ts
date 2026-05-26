import "./styles/tokens.css";
import "./styles/splash.css";
import { startRouter } from "./router";
import type { Screen } from "./state";

startRouter({
  getScreenRoot: (name: Screen) => document.getElementById(`screen-${name}`),
});
