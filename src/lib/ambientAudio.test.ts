import { describe, expect, it } from 'vitest';
import { ambientAudio, DEFAULT_PLAYLIST_TRACKS } from './ambientAudio';
import { GET as getPlaylist } from '@/app/api/playlist/route';

describe('ambientAudio & playlist discovery', () => {
  it('defaults to enabled with curated public tracks', () => {
    const snap = ambientAudio.getSnapshot();
    expect(snap.enabled).toBe(true);
    expect(snap.tracks.length).toBeGreaterThanOrEqual(3);
    expect(snap.tracks.map((t) => t.title)).toEqual(
      DEFAULT_PLAYLIST_TRACKS.map((t) => t.title)
    );
  });

  it('supports track selection, rotation, and play mode cycling while keeping enabled state', async () => {
    ambientAudio.setTracks(DEFAULT_PLAYLIST_TRACKS);
    expect(ambientAudio.getSnapshot().enabled).toBe(true);

    await ambientAudio.selectTrack(1);
    expect(ambientAudio.getSnapshot().trackIndex).toBe(1);
    expect(ambientAudio.getSnapshot().currentTrack?.title).toBe('2lostmypieces');
    expect(ambientAudio.getSnapshot().enabled).toBe(true);

    await ambientAudio.nextTrack();
    expect(ambientAudio.getSnapshot().trackIndex).toBe(2);
    expect(ambientAudio.getSnapshot().currentTrack?.title).toBe('3黄昏之时');

    await ambientAudio.prevTrack();
    expect(ambientAudio.getSnapshot().trackIndex).toBe(1);

    expect(ambientAudio.cyclePlayMode()).toBe('shuffle');
    expect(ambientAudio.cyclePlayMode()).toBe('loop-one');
    expect(ambientAudio.cyclePlayMode()).toBe('loop-all');
  });

  it('discovers audio tracks from the public folder via /api/playlist', async () => {
    const res = await getPlaylist();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      tracks: Array<{ id: string; title: string; src: string }>;
    };
    expect(json.tracks.map((t) => t.title)).toEqual([
      '1猫猫',
      '2lostmypieces',
      '3黄昏之时',
    ]);
    for (const track of json.tracks) {
      expect(track.src.startsWith('/')).toBe(true);
    }
  });
});
