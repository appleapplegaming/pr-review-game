// Audio side effects for the whole app plus a small mute toggle. Mount once in app.tsx.
// Plays the quarter-start and quarter-end stingers, runs the music while the game screen is up, and
// unlocks audio on the first user gesture.

import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../net/use-store';
import { screenFor } from '../routing';
import {
  getPrefs,
  setMusicPlaying,
  setPrefs,
  sfxQuarterEnd,
  sfxQuarterStart,
  subscribePrefs,
  unlockAudio,
} from './sound';
import styles from './SoundControls.module.css';

export function SoundControls() {
  const screen = useStore(screenFor);
  const room = useStore((s) => s.room);
  const [prefs, setLocal] = useState(getPrefs());
  const prevScreen = useRef(screen);

  useEffect(() => subscribePrefs(() => setLocal({ ...getPrefs() })), []);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    setMusicPlaying(screen === 'game');
    if (prevScreen.current !== screen) {
      if (screen === 'game') sfxQuarterStart();
      if (screen === 'postmortem') sfxQuarterEnd(!(room?.bankrupt ?? false));
      prevScreen.current = screen;
    }
  }, [screen, room?.bankrupt]);

  const on = prefs.sfx || prefs.music;
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={on}
      aria-label={on ? 'Mute sound' : 'Unmute sound'}
      onClick={() => {
        unlockAudio();
        setPrefs({ sfx: !on, music: !on });
      }}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}
