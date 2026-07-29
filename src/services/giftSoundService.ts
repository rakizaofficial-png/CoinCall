import { Audio, type AVPlaybackSource } from 'expo-av';

const GIFT_SOUND_SOURCES = {
  sparkle: require('../../assets/gift-sounds/magic-sparkle.ogg'),
  rise: require('../../assets/gift-sounds/magic-rise.ogg'),
  fireworks: require('../../assets/gift-sounds/fireworks.ogg'),
} as const;

type GiftSoundKind = keyof typeof GIFT_SOUND_SOURCES;

const loadedSounds = new Map<GiftSoundKind, Audio.Sound>();
const loadingSounds = new Map<GiftSoundKind, Promise<Audio.Sound | null>>();

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

async function loadSound(kind: GiftSoundKind): Promise<Audio.Sound | null> {
  const ready = loadedSounds.get(kind);
  if (ready) return ready;
  const pending = loadingSounds.get(kind);
  if (pending) return pending;

  const task = Audio.Sound.createAsync(
    GIFT_SOUND_SOURCES[kind] as AVPlaybackSource,
    { shouldPlay: false, volume: 0.78, positionMillis: 0 },
  )
    .then(({ sound }) => {
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
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    interruptionModeIOS: 1,
    interruptionModeAndroid: 1,
    shouldDuckAndroid: true,
  }).catch(() => undefined);
  await Promise.all(
    (Object.keys(GIFT_SOUND_SOURCES) as GiftSoundKind[]).map(loadSound),
  );
}

/** Starts a preloaded gift cue from frame zero and returns its shared player. */
export async function playGiftSound(giftId: string) {
  const sound = await loadSound(soundKindForGift(giftId));
  if (!sound) return null;
  await sound.stopAsync().catch(() => undefined);
  await sound.setPositionAsync(0).catch(() => undefined);
  await sound.playAsync().catch(() => undefined);
  return sound;
}

export async function stopGiftSound(sound: Audio.Sound | null) {
  if (!sound) return;
  await sound.stopAsync().catch(() => undefined);
  await sound.setPositionAsync(0).catch(() => undefined);
}
