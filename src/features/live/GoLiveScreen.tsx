import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  FlipHorizontal,
  Lock,
  Mic,
  MicOff,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  flipPreviewCamera,
  startCameraPreview,
  stopCameraPreview,
} from '../../services/agoraService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = {
  navigation: any;
  mode?: 'solo' | 'party';
};

export function GoLiveScreen({ navigation, mode = 'solo' }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { goLiveDraft, setGoLiveDraft, startSoloLive } =
    useLiveStudio();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>(
    goLiveDraft.facing === 'environment' ? 'back' : 'front',
  );
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewReady, setPreviewReady] = useState(Platform.OS !== 'web');

  // Cover always uses profile photo — skip country / language / image setup
  useEffect(() => {
    setGoLiveDraft({
      thumbnailUrl: user.avatarUrl || goLiveDraft.thumbnailUrl,
      category: goLiveDraft.category || 'Beauty',
      language: goLiveDraft.language || 'English',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.avatarUrl]);

  useEffect(() => {
    // Request camera first so native preview can paint ASAP — mic is separate.
    if (Platform.OS !== 'web') {
      if (!permission?.granted) void requestPermission();
      if (!micPermission?.granted) void requestMicPermission();
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const mountPreview = async (attempt = 0) => {
      // Don't block preview on mic permission — video mounts as soon as DOM is ready.
      const mount = document.getElementById('golive-preview-mount');
      if (!mount) {
        if (attempt < 20 && !cancelled) {
          retryTimer = setTimeout(() => void mountPreview(attempt + 1), 50);
        }
        return;
      }
      try {
        let el = document.getElementById('golive-preview') as HTMLVideoElement | null;
        if (!el) {
          el = document.createElement('video');
          el.id = 'golive-preview';
          el.autoplay = true;
          el.muted = true;
          el.playsInline = true;
          el.setAttribute('playsinline', 'true');
          el.style.width = '100%';
          el.style.height = '100%';
          el.style.objectFit = 'cover';
          el.style.transform =
            goLiveDraft.facing === 'user' ? 'scaleX(-1)' : 'none';
          mount.innerHTML = '';
          mount.appendChild(el);
        }
        videoRef.current = el;
        await startCameraPreview(el, goLiveDraft.facing);
        if (!cancelled) setPreviewReady(true);
      } catch (e) {
        if (!cancelled) {
          setPreviewReady(false);
          notify(
            'Camera permission',
            e instanceof Error ? e.message : 'Allow camera & mic to go live',
          );
        }
      }
    };

    void mountPreview();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      stopCameraPreview(videoRef.current);
      document.getElementById('golive-preview')?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  const onFlip = async () => {
    if (Platform.OS === 'web') {
      if (!videoRef.current) return;
      try {
        const next = await flipPreviewCamera(
          videoRef.current,
          facing === 'front' ? 'user' : 'environment',
        );
        setFacing(next === 'user' ? 'front' : 'back');
        setGoLiveDraft({ facing: next });
        videoRef.current.style.transform = next === 'user' ? 'scaleX(-1)' : 'none';
      } catch (e) {
        notify('Camera', e instanceof Error ? e.message : 'Could not flip');
      }
      return;
    }
    const next = facing === 'front' ? 'back' : 'front';
    setFacing(next);
    setGoLiveDraft({ facing: next === 'front' ? 'user' : 'environment' });
  };

  const onStart = async () => {
    if (Platform.OS !== 'web') {
      if (!permission?.granted) {
        const cam = await requestPermission();
        if (!cam.granted) {
          notify('Camera', 'Allow camera access to go live');
          return;
        }
      }
      if (!micPermission?.granted) {
        const mic = await requestMicPermission();
        if (!mic.granted) {
          notify('Microphone', 'Allow microphone access to go live');
          return;
        }
      }
      if (!camOn) {
        notify('Camera', 'Turn camera on before going live');
        return;
      }
    }
    setBusy(true);
    try {
      // Ensure defaults without forcing setup UI
      setGoLiveDraft({
        title: goLiveDraft.title.trim() || `${user.name}'s Live`,
        thumbnailUrl: user.avatarUrl || goLiveDraft.thumbnailUrl,
        category: goLiveDraft.category || 'Beauty',
        language: goLiveDraft.language || 'English',
      });
      if (Platform.OS === 'web') stopCameraPreview(videoRef.current);
      const room = await startSoloLive();
      navigation.replace('LiveRoom', { roomId: room.id, hostMode: true });
    } catch (e) {
      notify('Go Live failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const beautyFilter =
    goLiveDraft.beautyOn && Platform.OS === 'web'
      ? ({ filter: 'brightness(1.12) contrast(1.05) saturate(1.15)' } as any)
      : undefined;

  return (
    <View style={[styles.root, { backgroundColor: '#05070F' }]}>
      <View style={[styles.preview, { paddingTop: insets.top }, beautyFilter]}>
        {Platform.OS === 'web' ? (
          <div id="golive-preview-mount" style={webMountStyle} />
        ) : permission?.granted && camOn ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            enableTorch={flash}
            mute={!micOn}
          />
        ) : (
          <View style={styles.previewFallback}>
            <Camera size={48} color="#fff" />
            <Text style={styles.previewHint}>
              {permission?.granted
                ? 'Camera paused'
                : 'Allow camera & microphone to preview'}
            </Text>
            {!permission?.granted || !micPermission?.granted ? (
              <Pressable
                onPress={() => {
                  void requestPermission();
                  void requestMicPermission();
                }}
                style={styles.chip}
              >
                <Text style={styles.chipText}>Grant permission</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {!previewReady && Platform.OS === 'web' ? (
          <View style={styles.loading}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Opening camera…</Text>
          </View>
        ) : null}

        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.chip}>
            <Text style={styles.chipText}>Close</Text>
          </Pressable>
          <Text style={styles.modeLabel}>GO LIVE</Text>
          <View style={{ width: 64 }} />
        </View>

        <View style={styles.sideTools}>
          <Tool icon={FlipHorizontal} label="Flip" onPress={() => void onFlip()} />
          <Tool
            icon={Sparkles}
            label="Beauty"
            active={goLiveDraft.beautyOn}
            onPress={() => setGoLiveDraft({ beautyOn: !goLiveDraft.beautyOn })}
          />
          <Tool
            icon={micOn ? Mic : MicOff}
            label="Mic"
            active={micOn}
            onPress={() => setMicOn((v) => !v)}
          />
          <Tool
            icon={camOn ? Video : Camera}
            label="Cam"
            active={camOn}
            onPress={() => setCamOn((v) => !v)}
          />
          <Tool
            icon={Zap}
            label="Flash"
            active={flash}
            onPress={() => setFlash((v) => !v)}
          />
        </View>
      </View>

      <LinearGradient colors={['#0B1020', '#121A2E']} style={styles.sheet}>
        <View style={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Title (optional)
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={goLiveDraft.title}
            onChangeText={(title) => setGoLiveDraft({ title })}
            placeholder={`${user.name}'s Live`}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Cover uses your profile photo. Language & category stay from last time.
          </Text>

          <View style={[styles.lockRow, { borderColor: colors.border }]}>
            <View style={styles.lockLeft}>
              <Lock size={18} color={goLiveDraft.entryLocked ? '#F5C14C' : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.lockTitle, { color: colors.text }]}>Premium Live Lock</Text>
                <Text style={[styles.hint, { color: colors.textMuted, marginTop: 2 }]}>
                  Fans must pay coins before entering
                </Text>
              </View>
            </View>
            <Switch
              value={goLiveDraft.entryLocked}
              onValueChange={(entryLocked) => setGoLiveDraft({ entryLocked })}
              trackColor={{ false: '#334155', true: '#FF4D8D' }}
              thumbColor="#fff"
            />
          </View>

          {goLiveDraft.entryLocked ? (
            <View style={styles.feePresets}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Entry fee
              </Text>
              <View style={styles.presetRow}>
                {[50, 100, 500, 1000, 5000].map((fee) => {
                  const on = goLiveDraft.entryFee === fee;
                  return (
                    <Pressable
                      key={fee}
                      onPress={() => setGoLiveDraft({ entryFee: fee, entryLocked: true })}
                      style={[styles.presetChip, on && styles.presetChipOn]}
                    >
                      <Text style={[styles.presetText, on && styles.presetTextOn]}>
                        {fee >= 1000 ? `${fee / 1000}k` : fee}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.hint, { color: '#F5C14C', marginTop: 8 }]}>
                🔒 {goLiveDraft.entryFee} coins required · verified on server
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            label={busy ? 'Starting…' : 'Start Live'}
            onPress={() => void onStart()}
            loading={busy}
            style={{ marginTop: 16 }}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

function Tool({
  icon: Icon,
  label,
  onPress,
  active,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tool, active && styles.toolOn]}>
      <Icon size={18} color="#fff" />
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  );
}

const webMountStyle: any = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: '#000',
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  preview: { flex: 1.4, overflow: 'hidden' },
  previewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewHint: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  chipText: { color: '#fff', fontWeight: '700' },
  modeLabel: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
  sideTools: { position: 'absolute', right: 12, bottom: 24, gap: 10 },
  tool: {
    width: 56,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 10,
    borderRadius: 16,
  },
  toolOn: { backgroundColor: 'rgba(108,124,255,0.65)' },
  toolLabel: { color: '#fff', fontSize: 10, fontWeight: '700' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  label: { fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 12, marginTop: 10, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  lockRow: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  lockLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  lockTitle: { fontWeight: '800', fontSize: 14 },
  feePresets: { marginTop: 10 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 58,
    alignItems: 'center',
  },
  presetChipOn: {
    backgroundColor: 'rgba(245,193,76,0.18)',
    borderColor: '#F5C14C',
  },
  presetText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 14 },
  presetTextOn: { color: '#F5C14C' },
});
