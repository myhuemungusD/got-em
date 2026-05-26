import type { Screen } from "../state";
import { mount as mountBoot } from "./boot";
import { mount as mountSetupError } from "./setup-error";
import { mount as mountSplash } from "./splash";
import { mount as mountModeSelect } from "./mode-select";
import { mount as mountLobby } from "./lobby";
import { mount as mountPlay } from "./play";
import { mount as mountGameover } from "./gameover";

export type MountFn = (root: HTMLElement) => () => void;

export const screens: Record<Screen, MountFn> = {
  boot: mountBoot,
  "setup-error": mountSetupError,
  splash: mountSplash,
  "mode-select": mountModeSelect,
  lobby: mountLobby,
  play: mountPlay,
  gameover: mountGameover,
};
