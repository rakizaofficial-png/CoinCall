import * as ImagePicker from 'expo-image-picker';
import { ResizeMode, Video as ExpoVideo } from 'expo-av';
import { Camera, Check, Plus, Trash2, Video, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { HOST_COUNTRIES } from '../../data/countries';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';
import { publishHostPresence } from '../../services/callBridge';
import { isPublicHttpAvatar } from '../../utils/hostAvatar';

const MAX_PHOTOS = 6;
const LANGUAGES = [
  'English',
  'Urdu',
  'Arabic',
  'Hindi',
  'Turkish',
  'Spanish',
  'French',
];
const CATEGORIES = [
  'Talk',
  'Music',
  'Chill',
  'Party',
  'Lifestyle',
  'Gaming',
  'VIP',
  'Beauty',
];

export function EditHostProfileScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user: authUser, saveHostProfile } = useAuth();
  const { user, updateUser, hostOnline } = useApp();
  const profile = user.id ? user : authUser;

  const [name, setName] = useState(profile?.name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [countryQuery, setCountryQuery] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    profile?.photoUrls?.length
      ? profile.photoUrls
      : profile?.avatarUrl
        ? [profile.avatarUrl]
        : [],
  );
  const [videoUrl, setVideoUrl] = useState(profile?.videoUrl ?? '');
  const [languages, setLanguages] = useState<string[]>(
    profile?.languages?.length ? profile.languages : ['English'],
  );
  const [categories, setCategories] = useState<string[]>(
    profile?.categories?.length ? profile.categories : ['Talk'],
  );
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  const filteredCountries = useMemo(
    () =>
      HOST_COUNTRIES.filter((c) =>
        c.toLowerCase().includes(countryQuery.trim().toLowerCase()),
      ),
    [countryQuery],
  );

  const pickPhotos = async () => {
    if (photoUrls.length >= MAX_PHOTOS) {
      notify('Photos', `Up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Allow photo library access.');
      return;
    }
    const remaining = MAX_PHOTOS - photoUrls.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!result.canceled && result.assets.length) {
      setPhotoUrls(
        [...photoUrls, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS),
      );
    }
  };

  const pickMainCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUrls([result.assets[0].uri, ...photoUrls].slice(0, MAX_PHOTOS));
    }
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Allow video access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setVideoUrl(result.assets[0].uri);
    }
  };

  const toggleChip = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
  ) => {
    setList(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
    );
  };

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    setStage('photos');
    try {
      const saved = await saveHostProfile(
        {
          name,
          bio,
          country,
          photoUrls,
          videoUrl: videoUrl || undefined,
          languages,
          categories,
        },
        setStage,
      );
      updateUser({
        name: saved.name,
        bio: saved.bio,
        country: saved.country,
        avatarUrl: saved.avatarUrl,
        photoUrl: saved.photoUrl,
        photoUrls: saved.photoUrls,
        videoUrl: saved.videoUrl,
        languages: saved.languages,
        categories: saved.categories,
      });
      if (hostOnline && saved.avatarUrl) {
        void publishHostPresence({
          id: saved.id,
          name: saved.name,
          avatarUrl: saved.avatarUrl,
          photoUrl: saved.photoUrl || saved.avatarUrl,
          country: saved.country,
          ratePerMinute: saved.callPrice || 80,
          isOnline: true,
        }).catch(() => undefined);
      }
      notify('Profile saved', 'Your public host profile was updated.');
      navigation.goBack();
    } catch (e) {
      notify(
        'Could not save',
        e instanceof Error ? e.message : 'Try a smaller photo or video.',
      );
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const stageLabel =
    stage === 'photos'
      ? 'Uploading photos…'
      : stage === 'video'
        ? 'Uploading video…'
        : stage === 'done'
          ? 'Saving…'
          : 'Save profile';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <X size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit profile</Text>
        <Pressable
          onPress={() => void onSave()}
          disabled={busy}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Check size={18} color="#fff" />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.label, { color: colors.textMuted }]}>Profile photo</Text>
        <View style={styles.avatarRow}>
          <Image
            source={{
              uri:
                photoUrls[0] ||
                'https://ui-avatars.com/api/?name=H&background=1a1520&color=fff&size=256',
            }}
            style={styles.avatar}
          />
          <View style={{ flex: 1, gap: 8 }}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => void pickPhotos()}
            >
              <Plus size={16} color={colors.primarySoft} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>Add photos</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={() => void pickMainCamera()}
            >
              <Camera size={16} color={colors.accent} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>Take photo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.gallery}>
          {photoUrls.map((uri, i) => (
            <View key={`${uri}_${i}`} style={styles.gItem}>
              <Image source={{ uri }} style={styles.gImg} />
              {i === 0 ? (
                <View style={styles.mainTag}>
                  <Text style={styles.mainTagText}>Main</Text>
                </View>
              ) : null}
              <Pressable
                style={styles.trash}
                onPress={() => setPhotoUrls((list) => list.filter((p) => p !== uri))}
              >
                <Trash2 size={14} color="#fff" />
              </Pressable>
              {i > 0 ? (
                <Pressable
                  style={styles.makeMain}
                  onPress={() =>
                    setPhotoUrls((list) => [
                      uri,
                      ...list.filter((p) => p !== uri),
                    ])
                  }
                >
                  <Text style={styles.makeMainText}>Main</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>Display name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your host name"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Tell fans about you…"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          style={[
            styles.input,
            styles.bioInput,
            { color: colors.text, backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>Country</Text>
        <Pressable
          onPress={() => setShowCountries((v) => !v)}
          style={[
            styles.input,
            { backgroundColor: colors.bgCard, borderColor: colors.border, justifyContent: 'center' },
          ]}
        >
          <Text style={{ color: country ? colors.text : colors.textMuted, fontWeight: '700' }}>
            {country || 'Select country'}
          </Text>
        </Pressable>
        {showCountries ? (
          <View
            style={[
              styles.countryBox,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <TextInput
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder="Search…"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
            <ScrollView style={{ maxHeight: 160 }}>
              {filteredCountries.slice(0, 40).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    setCountry(c);
                    setShowCountries(false);
                    setCountryQuery('');
                  }}
                  style={styles.countryRow}
                >
                  <Text style={{ color: colors.text }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.textMuted }]}>Intro video (max 60s)</Text>
        {videoUrl ? (
          <View
            style={[
              styles.videoWrap,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <ExpoVideo
              source={{ uri: videoUrl }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
            />
            <View style={styles.videoActions}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
                onPress={() => void pickVideo()}
              >
                <Video size={16} color={colors.primarySoft} />
                <Text style={{ color: colors.text, fontWeight: '700' }}>Replace</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.bg, borderColor: colors.border }]}
                onPress={() => setVideoUrl('')}
              >
                <Trash2 size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
              </Pressable>
            </View>
            {!isPublicHttpAvatar(videoUrl) ? (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                Local video — will upload when you save.
              </Text>
            ) : null}
          </View>
        ) : (
          <Pressable
            style={[
              styles.uploadVideo,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
            onPress={() => void pickVideo()}
          >
            <Video size={22} color={colors.primarySoft} />
            <Text style={{ color: colors.text, fontWeight: '800' }}>Upload intro video</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Show your face · smile · 15–60 seconds
            </Text>
          </Pressable>
        )}

        <Text style={[styles.label, { color: colors.textMuted }]}>Languages</Text>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => {
            const on = languages.includes(l);
            return (
              <Pressable
                key={l}
                onPress={() => toggleChip(languages, setLanguages, l)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? `${colors.primary}33` : colors.bgCard,
                    borderColor: on ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{l}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>Categories</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => {
            const on = categories.includes(c);
            return (
              <Pressable
                key={c}
                onPress={() => toggleChip(categories, setCategories, c)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? `${colors.accent}33` : colors.bgCard,
                    borderColor: on ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.primarySave, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
          onPress={() => void onSave()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primarySaveText}>{stageLabel}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  saveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 14,
  },
  avatarRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#222' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  gItem: { width: '31%', aspectRatio: 1, borderRadius: radii.md, overflow: 'hidden' },
  gImg: { width: '100%', height: '100%' },
  trash: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 4,
  },
  mainTag: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(255,138,0,0.95)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mainTagText: { color: '#111', fontSize: 10, fontWeight: '900' },
  makeMain: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  makeMainText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  bioInput: { minHeight: 100, textAlignVertical: 'top' },
  countryBox: { borderWidth: 1, borderRadius: 14, padding: 8, marginTop: 8 },
  countryRow: { paddingVertical: 10, paddingHorizontal: 8 },
  videoWrap: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', padding: 8 },
  video: { width: '100%', height: 200, backgroundColor: '#000', borderRadius: 12 },
  videoActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  uploadVideo: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primarySave: {
    marginTop: 28,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primarySaveText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
