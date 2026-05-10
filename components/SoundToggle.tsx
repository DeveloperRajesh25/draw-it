'use client';
import * as React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getSoundEnabled, setSoundEnabled } from '@/lib/identity';

export function SoundToggle() {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    setOn(getSoundEnabled());
  }, []);
  const flip = () => {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      className="press-doodle inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark"
      aria-label={on ? 'Mute' : 'Unmute'}
      title={on ? 'Mute' : 'Unmute'}
    >
      {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
}
