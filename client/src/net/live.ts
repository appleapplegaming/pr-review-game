// The app's one socket client, wired to the browser and the app-wide store.
// Views send through `net.send(...)`, which returns false while the socket is not open.

import { store } from './store';
import { browserConnect, createSocketClient, wsUrl } from './socket';
import { browserStorage } from './session';

export const net = createSocketClient({
  url: wsUrl(window.location),
  store,
  connect: browserConnect,
  storage: browserStorage(),
  now: () => Date.now(),
  random: () => Math.random(),
});
