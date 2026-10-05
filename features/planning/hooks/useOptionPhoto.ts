import { useEffect, useRef, useState } from 'react';

import type { OptionPhoto } from '@/lib/ai';
import { freshPhoto, photoPlaceId } from '../photoRefresh';
import type { OptionPlan } from '../types';

type Stage = 'saved' | 'refreshing' | 'fresh' | 'broken';

/**
 * The photo to show on an option card. If the saved Google link fails, one fresh
 * link is asked for (once per photo per app session); if that fails too, or there
 * is no place ID, it's null and the card keeps its drawing.
 */
export function useOptionPhoto(tripId: string, plan: OptionPlan): { photo: OptionPhoto | null; onError: () => void } {
  const saved = plan.photo ?? null;
  const placeId = photoPlaceId(plan);
  const [stage, setStage] = useState<Stage>('saved');
  const [fresh, setFresh] = useState<OptionPhoto | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A new saved link (e.g. someone else refreshed it) gets its own chance.
  useEffect(() => {
    setStage('saved');
    setFresh(null);
  }, [saved?.url]);

  const onError = () => {
    if (stage !== 'saved' || !saved || !placeId) {
      setStage('broken');
      return;
    }
    setStage('refreshing');
    freshPhoto(tripId, placeId).then((p) => {
      if (!alive.current) return;
      if (p && p.url !== saved.url) {
        setFresh(p);
        setStage('fresh');
      } else {
        setStage('broken');
      }
    });
  };

  const photo = stage === 'saved' ? saved : stage === 'fresh' ? fresh : null;
  return { photo, onError };
}
