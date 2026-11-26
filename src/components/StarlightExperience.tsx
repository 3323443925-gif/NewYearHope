'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Bookmark,
  ChevronDown,
  Flame,
  Globe,
  Info,
  ListMusic,
  Music2,
  RefreshCw,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
  X,
} from 'lucide-react';
import type { LanternItem } from '@/types/lantern';
import type { HoverPreviewPayload } from '@/scene/StarlightScene';
import type { SceneCanvasHandle } from '@/components/SceneCanvas';
import { useI18n, interpolate } from '@/lib/i18n';
import {
  createVirtualClock,
  getDaysUntil2027,
  getFestivalStage,
  getLocalDayClock,
} from '@/lib/festival';
import {
  forgetMyLanternId,
  getMyLanternIds,
  getSeenReplyCounts,
  markLanternRepliesSeen,
  rememberMyLanternId,
} from '@/lib/ownerStorage';
import FallbackSkyCanvas from './FallbackSkyCanvas';
import ComposeLanternModal from './ComposeLanternModal';
import LanternDetailModal from './LanternDetailModal';
import MyLanternsDrawer from './MyLanternsDrawer';
import CrisisSupportModal from './CrisisSupportModal';
import AboutModal from './AboutModal';
import { ambientAudio, type PlayMode, type PlaylistTrack } from '@/lib/ambientAudio';

const INTRO_SEEN_KEY = 'starlight_intro_seen_v1';

const SceneCanvas = dynamic(() => import('./SceneCanvas'), {
  ssr: false,
});

export default function StarlightExperience() {
  const { locale, dict, toggleLocale } = useI18n();

  const [lanterns, setLanterns] = useState<LanternItem[]>([]);
  const [myLanterns, setMyLanterns] = useState<LanternItem[]>([]);
  const [myIds, setMyIds] = useState<string[]>([]);
  const [seenReplyCounts, setSeenReplyCounts] = useState<Record<string, number>>({});
  const [freshlyLaunchedId, setFreshlyLaunchedId] = useState<string | undefined>();
  const [skyBatchKey, setSkyBatchKey] = useState(0);

  const [liteMode, setLiteMode] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [demoFireworks, setDemoFireworks] = useState(false);
  const [previewTimeParam, setPreviewTimeParam] = useState<string | null>(null);
  const [sparkSignal2D, setSparkSignal2D] = useState(0);

  const [hoverPreview, setHoverPreview] = useState<HoverPreviewPayload | null>(null);
  const [selectedLantern, setSelectedLantern] = useState<LanternItem | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [myDrawerOpen, setMyDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [crisisOpen, setCrisisOpen] = useState(false);
  const [cannonPopoverOpen, setCannonPopoverOpen] = useState(false);
  const [musicPopoverOpen, setMusicPopoverOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>(
    () => ambientAudio.getSnapshot().tracks
  );
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(
    () => ambientAudio.getSnapshot().trackIndex
  );
  const [playMode, setPlayMode] = useState<PlayMode>(
    () => ambientAudio.getSnapshot().playMode
  );
  const [introPhase, setIntroPhase] = useState<'show' | 'fade' | 'done'>('show');

  const sceneRef = useRef<SceneCanvasHandle | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Virtual clock supports ?previewTime=2026-12-31T23:59:50 for testing local midnight fireworks
  const getClockDate = useMemo(
    () => createVirtualClock(previewTimeParam),
    [previewTimeParam]
  );

  const [countdownText, setCountdownText] = useState('00:00:00');
  const [daysUntil2027, setDaysUntil2027] = useState<number>(35);
  const [stageWhisper, setStageWhisper] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // Initialize URL params, reduced motion preference, and local owner IDs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demoFireworks') === '1') {
      setDemoFireworks(true);
    }
    const pt = params.get('previewTime');
    if (pt) setPreviewTimeParam(pt);

    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (prefersReduced || params.get('lite') === '1') {
      setLiteMode(true);
    }

    setMyIds(getMyLanternIds());
    setSeenReplyCounts(getSeenReplyCounts());
    setSceneReady(true);
  }, []);

  // Opening title card: full on first visit of the session, a quick dissolve afterwards
  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
      window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // ignore storage restrictions
    }
    const fadeAt = seen ? 50 : 1900;
    const doneAt = seen ? 1300 : 3200;
    const t1 = setTimeout(() => setIntroPhase('fade'), fadeAt);
    const t2 = setTimeout(() => setIntroPhase('done'), doneAt);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Update local midnight countdown every second
  useEffect(() => {
    const tick = () => {
      const now = getClockDate();
      const clock = getLocalDayClock(now);
      setCountdownText(clock.countdownText);
      const days = getDaysUntil2027(now);
      setDaysUntil2027(days);
      const stage = getFestivalStage(now);

      if (stage === 'new_year_finale') {
        setStageWhisper(dict.brand.newYearDay);
      } else if (stage === 'eternal_isle') {
        setStageWhisper(dict.brand.eternalWhisper);
      } else if (days === 0) {
        setStageWhisper(dict.brand.newYearEve);
      } else {
        setStageWhisper(interpolate(dict.brand.countdownDays, { days }));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [getClockDate, dict]);

  const fetchLanterns = useCallback(
    async (idsOverride?: string[], shuffle = false, excludeIds?: string[]) => {
      const owned = idsOverride ?? getMyLanternIds();
      // Keep viewport poetic & curated (~12 mobile / ~14 desktop per sky batch)
      // so "Refresh Sky / 换一批夜空" brings genuinely fresh wishes into view!
      const limit = typeof window !== 'undefined' && window.innerWidth < 768 ? 12 : 14;
      const qs = new URLSearchParams({ limit: String(limit) });
      if (owned.length > 0) qs.set('myIds', owned.join(','));
      if (shuffle) qs.set('shuffle', '1');
      if (excludeIds && excludeIds.length > 0) {
        qs.set('excludeIds', excludeIds.join(','));
      }

      try {
        const res = await fetch(`/api/lanterns?${qs.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { lanterns?: LanternItem[] };
        const ownedSet = new Set(owned);
        const list = (json.lanterns ?? []).map((item) => ({
          ...item,
          isMine: ownedSet.has(item.id),
        }));
        setLanterns(list);

        if (owned.length > 0) {
          const mineRes = await fetch(
            `/api/lanterns?ids=${encodeURIComponent(owned.join(','))}`,
            { cache: 'no-store' }
          );
          if (mineRes.ok) {
            const mineJson = (await mineRes.json()) as { lanterns?: LanternItem[] };
            setMyLanterns(
              (mineJson.lanterns ?? []).map((item) => ({ ...item, isMine: true }))
            );
          }
        } else {
          setMyLanterns([]);
        }
      } catch {
        // Keep current lanterns softly
      }
    },
    []
  );

  useEffect(() => {
    fetchLanterns();
  }, [fetchLanterns]);

  const totalUnreadReplies = useMemo(() => {
    return myLanterns.reduce((sum, item) => {
      const seen = seenReplyCounts[item.id] ?? 0;
      return sum + Math.max(0, item.replyCount - seen);
    }, 0);
  }, [myLanterns, seenReplyCounts]);

  const handleRefreshSky = async () => {
    setRefreshing(true);
    const currentOthers = lanterns.filter((l) => !l.isMine).map((l) => l.id);
    await fetchLanterns(myIds, true, currentOthers);
    setSkyBatchKey((k) => k + 1);
    setRefreshing(false);
    showToast(dict.hud.refreshedSkyToast);
  };

  const handleCatchRandomLight = () => {
    if (lanterns.length === 0) return;
    const pool = lanterns.filter((l) => l.id !== selectedLantern?.id);
    const chosen =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : lanterns[0];
    setSelectedLantern(chosen);
  };

  const handleLanternCreated = (created: LanternItem, showCrisisSupport: boolean) => {
    const nextIds = rememberMyLanternId(created.id);
    setMyIds(nextIds);
    markLanternRepliesSeen(created.id, 0);
    setSeenReplyCounts(getSeenReplyCounts());
    setFreshlyLaunchedId(created.id);

    const mineItem: LanternItem = { ...created, isMine: true };
    setLanterns((prev) => [mineItem, ...prev.filter((p) => p.id !== created.id)]);
    setMyLanterns((prev) => [mineItem, ...prev.filter((p) => p.id !== created.id)]);

    // Gentle spark celebration when releasing a lantern
    if (liteMode) {
      setSparkSignal2D((s) => s + 1);
    } else {
      sceneRef.current?.triggerMiniSpark();
    }

    ambientAudio.playRelease();
    showToast(dict.compose.successToast);
    if (showCrisisSupport) {
      setCrisisOpen(true);
    }
  };

  const handleLanternUpdated = (updated: LanternItem) => {
    setLanterns((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setMyLanterns((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setSelectedLantern(updated);
    setSeenReplyCounts(getSeenReplyCounts());
  };

  const handleLanternRemoved = (id: string) => {
    const nextIds = forgetMyLanternId(id);
    setMyIds(nextIds);
    setLanterns((prev) => prev.filter((l) => l.id !== id));
    setMyLanterns((prev) => prev.filter((l) => l.id !== id));
  };

  // Default-on audio: start soundscape + rotating public/ playlist immediately on every load,
  // and unlock synchronously on the first user gesture if browser autoplay policy blocks it.
  useEffect(() => {
    let active = true;

    const syncSnapshot = () => {
      if (!active) return;
      const snap = ambientAudio.getSnapshot();
      setSoundOn(snap.enabled);
      setAudioNeedsGesture(snap.needsGesture);
      setPlaylist(snap.tracks);
      setCurrentTrackIndex(snap.trackIndex);
      setPlayMode(snap.playMode);
    };

    const unsubscribe = ambientAudio.subscribe(syncSnapshot);

    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('click', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
      window.removeEventListener('touchstart', handleFirstGesture, true);
    };

    const handleFirstGesture = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest('[data-sound-toggle="true"]')) return;
      void ambientAudio.unlockFromGesture().then((started) => {
        if (started) {
          removeGestureListeners();
        }
      });
    };

    // Arm gesture listeners immediately so even an early tap/drag unlocks audio synchronously
    window.addEventListener('pointerdown', handleFirstGesture, true);
    window.addEventListener('click', handleFirstGesture, true);
    window.addEventListener('keydown', handleFirstGesture, true);
    window.addEventListener('touchstart', handleFirstGesture, true);

    // Start immediately without waiting for network
    void ambientAudio.enable().then((started) => {
      if (!active) return;
      syncSnapshot();
      if (started) {
        removeGestureListeners();
      }
    });

    // Dynamically discover any songs placed inside /public
    void fetch('/api/playlist', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tracks?: PlaylistTrack[] } | null) => {
        if (active && data?.tracks && data.tracks.length > 0) {
          ambientAudio.setTracks(data.tracks);
          syncSnapshot();
        }
      })
      .catch(() => {
        // Keep built-in default playlist tracks
      });

    return () => {
      active = false;
      unsubscribe();
      removeGestureListeners();
      ambientAudio.disable();
    };
  }, []);

  const currentTrackTitle = playlist[currentTrackIndex]?.title ?? '';

  const toggleSound = async () => {
    if (soundOn && !audioNeedsGesture) {
      ambientAudio.disable();
      setSoundOn(false);
      setAudioNeedsGesture(false);
    } else {
      await ambientAudio.enable();
      const snap = ambientAudio.getSnapshot();
      setSoundOn(snap.enabled);
      setAudioNeedsGesture(snap.needsGesture);
    }
  };

  const handleSelectTrack = async (index: number) => {
    await ambientAudio.selectTrack(index);
    const snap = ambientAudio.getSnapshot();
    setSoundOn(snap.enabled);
    setAudioNeedsGesture(snap.needsGesture);
    setCurrentTrackIndex(snap.trackIndex);
  };

  const handleNextTrack = async () => {
    await ambientAudio.nextTrack();
    const snap = ambientAudio.getSnapshot();
    setSoundOn(snap.enabled);
    setAudioNeedsGesture(snap.needsGesture);
    setCurrentTrackIndex(snap.trackIndex);
  };

  const handlePrevTrack = async () => {
    await ambientAudio.prevTrack();
    const snap = ambientAudio.getSnapshot();
    setSoundOn(snap.enabled);
    setAudioNeedsGesture(snap.needsGesture);
    setCurrentTrackIndex(snap.trackIndex);
  };

  const handleCyclePlayMode = () => {
    const next = ambientAudio.cyclePlayMode();
    setPlayMode(next);
  };

  const handlePreviewFirework = () => {
    if (liteMode) {
      setSparkSignal2D((s) => s + 1);
    } else {
      sceneRef.current?.triggerFireworkShow(true);
    }
    setCannonPopoverOpen(false);
  };

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden text-slate-100">
      {/* 3D WebGL Scene or 2D Canvas Lite Fallback */}
      {sceneReady && !liteMode ? (
        <SceneCanvas
          lanterns={lanterns}
          freshlyLaunchedId={freshlyLaunchedId}
          skyBatchKey={skyBatchKey}
          getClockDate={getClockDate}
          demoFireworks={demoFireworks}
          onSelectLantern={(l) => {
            setHoverPreview(null);
            setSelectedLantern(l);
          }}
          onHoverLantern={setHoverPreview}
          onClickCannon={() => setCannonPopoverOpen((o) => !o)}
          onWebGLFailed={() => setLiteMode(true)}
          sceneRef={sceneRef}
        />
      ) : (
        <FallbackSkyCanvas
          lanterns={lanterns}
          skyBatchKey={skyBatchKey}
          getClockDate={getClockDate}
          onSelectLantern={(l) => setSelectedLantern(l)}
          onClickCannon={() => setCannonPopoverOpen((o) => !o)}
          sparkSignal={sparkSignal2D}
        />
      )}

      {/* Subtle Hover Preview Tooltip (Desktop) */}
      {hoverPreview && !selectedLantern && !composeOpen && (
        <div
          className="pointer-events-none fixed z-20 hidden max-w-[230px] -translate-x-1/2 -translate-y-full rounded-2xl border border-amber-200/30 bg-[#08132d]/88 px-3.5 py-2.5 text-xs shadow-xl backdrop-blur-md sm:block"
          style={{
            left: Math.max(125, Math.min(window.innerWidth - 125, hoverPreview.screenX)),
            top: Math.max(85, hoverPreview.screenY - 18),
          }}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-amber-200">
            <span className="truncate font-medium">
              {hoverPreview.lantern.nickname || dict.compose.anonymous}
            </span>
            <span className="shrink-0 opacity-85">
              {dict.moods[hoverPreview.lantern.mood]}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 leading-5 text-slate-100/95">
            {hoverPreview.lantern.content}
          </p>
        </div>
      )}

      {/* Top HUD Bar */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        {/* Brand + Date Whisper */}
        <div className="pointer-events-auto max-w-[60%] rounded-2xl border border-white/10 bg-[#07122b]/55 px-3.5 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            <h1 className="font-brand truncate text-sm font-semibold tracking-[0.14em] text-amber-50 sm:text-base">
              {dict.brand.name}
            </h1>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-sky-100/80 sm:text-xs">
            {stageWhisper || dict.brand.subtitle}
          </p>
        </div>

        {/* Right Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setMusicPopoverOpen(false);
              setCannonPopoverOpen((o) => !o);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-[#07122b]/60 px-3 py-2 text-xs text-amber-100 backdrop-blur-md transition hover:border-amber-300/50 hover:bg-[#0b1b42]/80"
            title={dict.hud.fireworkCountdownTitle}
          >
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            <span className="font-mono text-[11px] sm:text-xs">{countdownText}</span>
          </button>

          <button
            type="button"
            onClick={() => setMyDrawerOpen(true)}
            className="relative inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#07122b]/60 px-3 py-2 text-xs text-slate-100 backdrop-blur-md transition hover:border-amber-200/40 hover:bg-[#0b1b42]/80"
          >
            <Bookmark className="h-3.5 w-3.5 text-amber-300" />
            <span className="hidden sm:inline">{dict.hud.myLanterns}</span>
            {totalUnreadReplies > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-300 px-1 text-[10px] font-bold text-[#191108]">
                {totalUnreadReplies}
              </span>
            )}
          </button>

          {/* Sound Toggle + Song Selector Controls */}
          <div
            className={`inline-flex items-center rounded-full border backdrop-blur-md transition ${
              soundOn
                ? 'border-amber-300/45 bg-amber-300/12 text-amber-100'
                : 'border-white/15 bg-[#07122b]/60 text-slate-300 hover:border-amber-200/40 hover:text-white'
            }`}
          >
            <button
              type="button"
              data-sound-toggle="true"
              onClick={toggleSound}
              className="relative inline-flex items-center justify-center rounded-full p-2 transition hover:text-amber-50"
              aria-label={
                soundOn && !audioNeedsGesture
                  ? dict.hud.soundOff
                  : dict.hud.soundOn
              }
              title={
                audioNeedsGesture
                  ? dict.hud.tapForSound
                  : soundOn
                  ? dict.hud.soundOff
                  : dict.hud.soundOn
              }
            >
              {soundOn ? <Volume2 className="h-4 w-4 shrink-0" /> : <VolumeX className="h-4 w-4 shrink-0" />}
              {audioNeedsGesture && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
              )}
            </button>

            {playlist.length > 0 && (
              <button
                type="button"
                data-sound-toggle="true"
                onClick={() => {
                  setCannonPopoverOpen(false);
                  setMusicPopoverOpen((o) => !o);
                }}
                className={`inline-flex items-center gap-1.5 rounded-r-full border-l px-2.5 py-2 text-xs transition ${
                  soundOn
                    ? 'border-amber-200/20 text-amber-100/95 hover:bg-amber-300/15 hover:text-amber-50'
                    : 'border-white/15 text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
                aria-label={dict.hud.chooseTrack}
                title={dict.hud.chooseTrack}
              >
                <ListMusic className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="hidden max-w-[104px] truncate text-[11px] sm:inline">
                  {currentTrackTitle || dict.hud.chooseTrack}
                </span>
                <ChevronDown
                  className={`h-3 w-3 shrink-0 opacity-75 transition-transform ${
                    musicPopoverOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={toggleLocale}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-[#07122b]/60 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur-md transition hover:border-amber-200/40"
            aria-label="Toggle Language"
          >
            <Globe className="h-3.5 w-3.5 text-sky-200" />
            {locale === 'zh' ? 'EN' : '中文'}
          </button>

          <button
            type="button"
            onClick={() => setLiteMode((m) => !m)}
            className="hidden items-center gap-1 rounded-full border border-white/15 bg-[#07122b]/60 px-3 py-2 text-xs text-slate-200 backdrop-blur-md transition hover:border-amber-200/40 md:inline-flex"
            title={liteMode ? dict.hud.mode3d : dict.hud.liteMode}
          >
            <Zap className="h-3.5 w-3.5 text-amber-200" />
            {liteMode ? dict.hud.mode3d : dict.hud.liteMode}
          </button>

          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-[#07122b]/60 p-2 text-slate-200 backdrop-blur-md transition hover:border-amber-200/40 hover:text-white"
            aria-label={dict.hud.about}
            title={dict.hud.about}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Winter Playlist / Song Selector Popover */}
      {musicPopoverOpen && (
        <div
          data-sound-toggle="true"
          className="fixed right-4 top-20 z-30 w-72 rounded-2xl border border-amber-200/30 bg-[#0a1738]/92 p-4 text-slate-100 shadow-2xl backdrop-blur-xl sm:right-6"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                <Music2 className="h-4 w-4 text-amber-300" />
                {dict.hud.playlistTitle}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-300/85">
                {dict.hud.playlistDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMusicPopoverOpen(false)}
              className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label={dict.detail.close}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {audioNeedsGesture && (
            <p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[11px] text-amber-100/90">
              {dict.hud.tapForSound}
            </p>
          )}

          <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
            {playlist.map((track, idx) => {
              const isCurrent = idx === currentTrackIndex;
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectTrack(idx)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                      isCurrent && soundOn
                        ? 'border-amber-300/45 bg-amber-300/15 text-amber-50'
                        : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-amber-200/30 hover:bg-white/[0.07]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-amber-200/70">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-medium">{track.title}</span>
                    </span>
                    {isCurrent && soundOn && (
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevTrack}
                className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 p-1.5 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
                title={dict.hud.prevTrack}
                aria-label={dict.hud.prevTrack}
              >
                <SkipBack className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextTrack}
                className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 p-1.5 text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
                title={dict.hud.nextTrack}
                aria-label={dict.hud.nextTrack}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCyclePlayMode}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-amber-200/40 hover:text-amber-100"
            >
              {playMode === 'loop-one' ? (
                <>
                  <Repeat1 className="h-3.5 w-3.5 text-amber-300" />
                  {dict.hud.playModeLoopOne}
                </>
              ) : playMode === 'shuffle' ? (
                <>
                  <Shuffle className="h-3.5 w-3.5 text-amber-300" />
                  {dict.hud.playModeShuffle}
                </>
              ) : (
                <>
                  <Repeat className="h-3.5 w-3.5 text-amber-300" />
                  {dict.hud.playModeLoopAll}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Local Midnight Firework Countdown Popover */}
      {cannonPopoverOpen && (
        <div className="fixed right-4 top-20 z-30 w-72 rounded-2xl border border-amber-200/30 bg-[#0a1738]/92 p-4 text-slate-100 shadow-2xl backdrop-blur-xl sm:right-6">
          <div className="flex items-start justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
              <Flame className="h-4 w-4 text-amber-300" />
              {dict.hud.fireworkCountdownTitle}
            </h3>
            <button
              type="button"
              onClick={() => setCannonPopoverOpen(false)}
              className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tracking-wider text-amber-100">
            {countdownText}
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-300">
            {dict.hud.fireworkCountdownDesc}
          </p>
          {daysUntil2027 > 0 && (
            <p className="mt-1 text-[11px] text-sky-200/90">
              {interpolate(dict.brand.countdownDays, { days: daysUntil2027 })}
            </p>
          )}
          <button
            type="button"
            onClick={handlePreviewFirework}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300/35 bg-amber-300/15 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-300/25"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {dict.hud.previewFirework}
          </button>
        </div>
      )}

      {/* Bottom Floating Action Dock */}
      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="mb-2.5 hidden text-center text-[11px] tracking-wide text-sky-100/65 sm:block">
          {dict.hud.dragHint}
        </p>

        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleRefreshSky}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#07122b]/70 px-3.5 py-2.5 text-xs text-slate-100 backdrop-blur-md transition hover:border-amber-200/40 hover:bg-[#0c1d45]/85"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-sky-200 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{dict.hud.refreshSky}</span>
          </button>

          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-6 py-3 text-sm font-semibold text-[#1c1308] shadow-[0_0_32px_rgba(255,190,105,0.42)] transition hover:scale-[1.02] hover:brightness-105 active:scale-[0.99]"
          >
            <Sparkles className="h-4 w-4" />
            {dict.hud.lightLantern}
          </button>

          <button
            type="button"
            onClick={handleCatchRandomLight}
            disabled={lanterns.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#07122b]/70 px-3.5 py-2.5 text-xs text-slate-100 backdrop-blur-md transition hover:border-amber-200/40 hover:bg-[#0c1d45]/85 disabled:opacity-50"
          >
            <Shuffle className="h-3.5 w-3.5 text-amber-200" />
            <span className="hidden sm:inline">{dict.hud.catchLight}</span>
          </button>
        </div>
      </footer>

      {/* Soft Toast Notification */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-amber-200/35 bg-[#0c1b40]/92 px-4 py-2 text-xs font-medium text-amber-100 shadow-xl backdrop-blur-md">
          {toast}
        </div>
      )}

      {/* Opening title card */}
      {introPhase !== 'done' && (
        <div
          className={`starlight-backdrop fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-[1200ms] ease-out ${
            introPhase === 'fade' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-hidden="true"
        >
          <div className="intro-rise flex flex-col items-center px-6 text-center">
            <span className="h-px w-16 bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
            <h2 className="font-brand mt-6 text-3xl tracking-[0.32em] text-amber-50 sm:text-4xl">
              {dict.brand.name}
            </h2>
            <p className="mt-4 text-xs tracking-[0.18em] text-sky-100/75 sm:text-sm">
              {dict.brand.subtitle}
            </p>
            <span className="mt-6 h-px w-16 bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      <ComposeLanternModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={handleLanternCreated}
      />

      <LanternDetailModal
        lantern={selectedLantern}
        onClose={() => setSelectedLantern(null)}
        onLanternUpdated={handleLanternUpdated}
        onLanternRemoved={handleLanternRemoved}
        onTriggerCrisisSupport={() => setCrisisOpen(true)}
        onToast={showToast}
      />

      <MyLanternsDrawer
        open={myDrawerOpen}
        lanterns={myLanterns}
        seenReplyCounts={seenReplyCounts}
        onClose={() => setMyDrawerOpen(false)}
        onSelect={(item) => setSelectedLantern(item)}
      />

      <CrisisSupportModal open={crisisOpen} onClose={() => setCrisisOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </main>
  );
}
