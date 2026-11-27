// The sounds are worked out on a thread of their own, so that the river can be painted meanwhile (src/ifing/sounds.js).
import { composeSounds } from './sounds.js';

composeSounds().then((S) => postMessage(S, Object.values(S).map((x) => x.buffer)));
