import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const GIFT_SOUND_SOURCES = {
  sparkle: require('../../assets/gift-sounds/magic-sparkle.ogg'),
  rise: require('../../assets/gift-sounds/magic-rise.ogg'),
  fireworks: require('../../assets/gift-sounds/fireworks.ogg'),
} as const;

type GiftSoundKind = keyof typeof GIFT_SOUND_SOURCES;

export type GiftSoundPlayback = {
  player: AudioPlayer;
  kind: GiftSoundKind;
  generation: number;
};

const loadedSounds = new Map<GiftSoundKind, AudioPlayer>();
const loadingSounds = new Map<GiftSoundKind, Promise<AudioPlayer | null>>();
const playbackGeneration = new Map<GiftSoundKind, number>();
let activePlayback: GiftSoundPlayback | null = null;

function soundKindForGift(giftId: string): GiftSoundKind {
  if (
    [
      'fireworks',
      'sports_car',
      'super_bike',
      'private_jet',
      'luxury_yacht',
      'diamond_rain',
    ].includes(giftId)
  ) {
    return 'fireworks';
  }
  if (
    ['diamond_crown', 'royal_castle', 'golden_throne', 'millionaire_box'].includes(
      giftId,
    )
  ) {
    return 'rise';
  }
  return 'sparkle';
}

async function loadSound(kind: GiftSoundKind): Promise<AudioPlayer | null> {
  const ready = loadedSounds.get(kind);
  if (ready) return ready;
  const pending = loadingSounds.get(kind);
  if (pending) return pending;

  const task = Promise.resolve()
    .then(() => {
      const sound = createAudioPlayer(GIFT_SOUND_SOURCES[kind]);
      sound.volume = 0.78;
      loadedSounds.set(kind, sound);
      loadingSounds.delete(kind);
      return sound;
    })
    .catch(() => {
      loadingSounds.delete(kind);
      return null;
    });
  loadingSounds.set(kind, task);
  return task;
}

/** Warm all bundled SFX while the live studio opens, before the first gift. */
export async function preloadGiftSounds() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
  }).catch(() => undefined);
  await Promise.all(
    (Object.keys(GIFT_SOUND_SOURCES) as GiftSoundKind[]).map(loadSound),
  );
}

/**
 * Starts one bundled gift cue from frame zero.
 *
 * A generation lease prevents cleanup from an old overlay from pausing a newer
 * gift that happens to use the same shared player.
 */
export async function playGiftSound(giftId: string) {
  const kind = soundKindForGift(giftId);
  const generation = (playbackGeneration.get(kind) || 0) + 1;
  playbackGeneration.set(kind, generation);
  const sound = await loadSound(kind);
  if (!sound) return null;

  if (activePlayback) {
    activePlayback.player.pause();
    await activePlayback.player.seekTo(0).catch(() => undefined);
    activePlayback = null;
  }

  if (playbackGeneration.get(kind) !== generation) return null;
  sound.pause();
  await sound.seekTo(0).catch(() => undefined);
  if (playbackGeneration.get(kind) !== generation) return null;

  const playback: GiftSoundPlayback = { player: sound, kind, generation };
  activePlayback = playback;
  sound.play();
  return playback;
}

export async function stopGiftSound(playback: GiftSoundPlayback | null) {
  if (!playback) return;
  if (playbackGeneration.get(playback.kind) !== playback.generation) return;
  if (activePlayback?.generation !== playback.generation) return;
  playback.player.pause();
  await playback.player.seekTo(0).catch(() => undefined);
  activePlayback = null;
}

export async function stopAllGiftSounds() {
  for (const kind of Object.keys(GIFT_SOUND_SOURCES) as GiftSoundKind[]) {
    playbackGeneration.set(kind, (playbackGeneration.get(kind) || 0) + 1);
  }
  const current = activePlayback;
  activePlayback = null;
  if (!current) return;
  current.player.pause();
  await current.player.seekTo(0).catch(() => undefined);
}
