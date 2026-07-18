import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  FlipHorizontal,
  Image as ImageIcon,
  Mic,
  MicOff,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { LIVE_CATEGORIES, LIVE_LANGUAGES } from '../../data/gifts';
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
  const { goLiveDraft, setGoLiveDraft, startSoloLive, startPartyLive } =
    useLiveStudio();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>(
    goLiveDraft.facing === 'environment' ? 'back' : 'front',
  );
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewReady, setPreviewReady] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      if (!permission?.granted) void requestPermission();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let el = document.getElementById('golive-preview') as HTMLVideoElement | null;
        if (!el) {
          el = document.createElement('video');
          el.id = 'golive-preview';
          el.autoplay = true;
          el.muted = true;
          el.playsInline = true;
          el.style.width = '100%';
          el.style.height = '100%';
          el.style.objectFit = 'cover';
          el.style.transform =
            goLiveDraft.facing === 'user' ? 'scaleX(-1)' : 'none';
          document.getElementById('golive-preview-mount')?.appendChild(el);
        }
        videoRef.current = el;
        await startCameraPreview(el, goLiveDraft.facing);
        if (!cancelled) setPreviewReady(true);
      } catch (e) {
        notify(
          'Camera permission',
          e instanceof Error ? e.message : 'Allow camera & mic to go live',
        );
      }
    })();
    return () => {
      cancelled = true;
      stopCameraPreview(videoRef.current);
      document.getElementById('golive-preview')?.remove();
    };
  }, []);

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

  const pickThumb = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setGoLiveDraft({ thumbnailUrl: res.assets[0].uri });
    }
  };

  const onStart = async () => {
    if (!goLiveDraft.title.trim()) {
      notify('Title required', 'Add a stream title before going live.');
      return;
    }
    setBusy(true);
    try {
      if (Platform.OS === 'web') stopCameraPreview(videoRef.current);
      const room =
        mode === 'party' ? await startPartyLive() : await startSoloLive();
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
          // @ts-expect-error web mount
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
                : 'Allow camera access to preview'}
            </Text>
            {!permission?.granted ? (
              <Pressable onPress={() => void requestPermission()} style={styles.chip}>
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
          <Text style={styles.modeLabel}>
            {mode === 'party' ? 'PARTY LIVE' : 'GO LIVE'}
          </Text>
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
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={goLiveDraft.title}
            onChangeText={(title) => setGoLiveDraft({ title })}
            placeholder="What are you streaming?"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {LIVE_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setGoLiveDraft({ category: c })}
                style={[
                  styles.cat,
                  {
                    backgroundColor:
                      goLiveDraft.category === c ? colors.primary : colors.bgCard,
                  },
                ]}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Language</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {LIVE_LANGUAGES.map((l) => (
              <Pressable
                key={l}
                onPress={() => setGoLiveDraft({ language: l })}
                style={[
                  styles.cat,
                  {
                    backgroundColor:
                      goLiveDraft.language === l ? colors.primarySoft : colors.bgCard,
                  },
                ]}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Thumbnail</Text>
          <Pressable style={styles.thumbRow} onPress={() => void pickThumb()}>
            <Image source={{ uri: goLiveDraft.thumbnailUrl }} style={styles.thumb} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Change cover</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Pick a photo fans see on Live cards
              </Text>
            </View>
            <ImageIcon size={20} color={colors.primarySoft} />
          </Pressable>

          <PrimaryButton
            label={
              busy
                ? 'Starting…'
                : mode === 'party'
                  ? 'Start Party Live'
                  : 'Start Live'
            }
            onPress={() => void onStart()}
            loading={busy}
            style={{ marginTop: 16 }}
          />
        </ScrollView>
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
  preview: { flex: 1.15, overflow: 'hidden' },
  previewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewHint: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  loading: {
    ...StyleSheet.absoluteFillObject,
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
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  label: { fontWeight: '700', marginTop: 10, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cat: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginRight: 8,
  },
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 14 },
});
