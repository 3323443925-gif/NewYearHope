'use client';

import React, { useEffect, useRef } from 'react';
import type { LanternItem } from '@/types/lantern';
import { ambientAudio } from '@/lib/ambientAudio';
import {
  StarlightScene,
  type HoverPreviewPayload,
} from '@/scene/StarlightScene';

export interface SceneCanvasHandle {
  triggerFireworkShow: (grand?: boolean) => void;
  triggerMiniSpark: () => void;
}

interface SceneCanvasProps {
  lanterns: LanternItem[];
  freshlyLaunchedId?: string;
  skyBatchKey?: number;
  getClockDate: () => Date;
  demoFireworks?: boolean;
  onSelectLantern: (lantern: LanternItem) => void;
  onHoverLantern: (preview: HoverPreviewPayload | null) => void;
  onClickCannon: () => void;
  onWebGLFailed: () => void;
  sceneRef?: React.MutableRefObject<SceneCanvasHandle | null>;
}

export default function SceneCanvas({
  lanterns,
  freshlyLaunchedId,
  skyBatchKey = 0,
  getClockDate,
  demoFireworks,
  onSelectLantern,
  onHoverLantern,
  onClickCannon,
  onWebGLFailed,
  sceneRef,
}: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StarlightScene | null>(null);
  const latestLanternsRef = useRef(lanterns);
  const latestFreshIdRef = useRef(freshlyLaunchedId);
  const latestBatchKeyRef = useRef(skyBatchKey);
  const callbacksRef = useRef({
    onSelectLantern,
    onHoverLantern,
    onClickCannon,
    onWebGLFailed,
  });

  latestLanternsRef.current = lanterns;
  latestFreshIdRef.current = freshlyLaunchedId;
  latestBatchKeyRef.current = skyBatchKey;

  useEffect(() => {
    callbacksRef.current = {
      onSelectLantern,
      onHoverLantern,
      onClickCannon,
      onWebGLFailed,
    };
  }, [onSelectLantern, onHoverLantern, onClickCannon, onWebGLFailed]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    try {
      const engine = new StarlightScene(
        el,
        {
          onSelectLantern: (l) => callbacksRef.current.onSelectLantern(l),
          onHoverLantern: (p) => callbacksRef.current.onHoverLantern(p),
          onClickCannon: () => callbacksRef.current.onClickCannon(),
          onLowPerformanceDetected: () => {
            // Bloom already stepped down smoothly
          },
          onFireworkBurst: (intensity) => ambientAudio.playBoom(intensity),
        },
        getClockDate
      );
      engineRef.current = engine;
      // Sync immediately upon mount (critical when toggling back from Lite Mode!)
      engine.syncLanterns(
        latestLanternsRef.current,
        latestFreshIdRef.current,
        latestBatchKeyRef.current
      );

      if (sceneRef) {
        sceneRef.current = {
          triggerFireworkShow: (grand) => engine.triggerFireworkShow(grand),
          triggerMiniSpark: () => engine.triggerMiniSpark(),
        };
      }
      if (demoFireworks) {
        setTimeout(() => engine.triggerFireworkShow(true), 700);
      }

      return () => {
        if (sceneRef) sceneRef.current = null;
        engine.dispose();
        engineRef.current = null;
      };
    } catch {
      callbacksRef.current.onWebGLFailed();
      return undefined;
    }
  }, [getClockDate, demoFireworks, sceneRef]);

  useEffect(() => {
    engineRef.current?.syncLanterns(lanterns, freshlyLaunchedId, skyBatchKey);
  }, [lanterns, freshlyLaunchedId, skyBatchKey]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 h-full w-full touch-none select-none"
      aria-label="Starlight Isle 3D Scene"
    />
  );
}
