import { startRouter } from "./router";
import type { Screen } from "./state";

startRouter({
  getScreenRoot: (name: Screen) => document.getElementById(`screen-${name}`),
});
