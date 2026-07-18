import * as ImagePicker from 'expo-image-picker';
import { ResizeMode, Video as ExpoVideo } from 'expo-av';
import { Plus, Video, X } from 'lucide-react-native';
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
import { useAuth } from '../../context/AuthContext';
import { HOST_COUNTRIES } from '../../data/countries';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { callPriceForLevel } from '../../utils/hostPricing';
import { notify } from '../../utils/notify';

const MAX_PHOTOS = 8;
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
];

export function HostApplyScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, submitHostApplication, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [countryQuery, setCountryQuery] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    user?.photoUrls?.length
      ? user.photoUrls
      : user?.photoUrl
        ? [user.photoUrl]
        : [],
  );
  const [videoUrl, setVideoUrl] = useState(user?.videoUrl ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [languages, setLanguages] = useState<string[]>(
    user?.languages?.length ? user.languages : ['English'],
  );
  const [categories, setCategories] = useState<string[]>(
    user?.categories?.length ? user.categories : ['Talk'],
  );
  const [showCountries, setShowCountries] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoPrice = useMemo(
    () => callPriceForLevel(user?.level || 1),
    [user?.level],
  );

  const filteredCountries = HOST_COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countryQuery.trim().toLowerCase()),
  );

  const pickPhotos = async () => {
    if (photoUrls.length >= MAX_PHOTOS) {
      notify('Photos', `You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Please allow photo access.');
      return;
    }
    const remaining = MAX_PHOTOS - photoUrls.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!result.canceled && result.assets.length) {
      setPhotoUrls(
        [...photoUrls, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS),
      );
    }
  };

  const removePhoto = (uri: string) => {
    setPhotoUrls((list) => list.filter((p) => p !== uri));
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Please allow video access.');
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

  const stageLabel = (stage: string | null) => {
    if (stage === 'photos') return 'Uploading photos…';
    if (stage === 'video') return 'Uploading video…';
    if (stage === 'done') return 'Saving…';
    return 'Submitting…';
  };

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    setUploadStage('photos');
    const safety = setTimeout(() => {
      setLoading(false);
      setUploadStage(null);
      setError('Submit took too long. Try a smaller photo and tap Submit again.');
    }, 28_000);
    try {
      await submitHostApplication(
        {
          name,
          country,
          photoUrls,
          videoUrl: undefined, // skip video during apply to avoid hangs
          bio,
          languages,
          categories,
        },
        (stage) => setUploadStage(stage),
      );
      notify('Submitted', 'Waiting for quick admin approval.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      clearTimeout(safety);
      setLoading(false);
      setUploadStage(null);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.brand, { color: colors.text }]}>Become a Host</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Easy apply · name, country & 1 photo. Call price is set by your level.
      </Text>

      <View
        style={[
          styles.priceCard,
          { backgroundColor: `${colors.primary}22`, borderColor: colors.primarySoft },
        ]}
      >
        <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
          Your rate (auto from Level {user?.level || 1})
        </Text>
        <Text style={[styles.priceValue, { color: colors.text }]}>
          {autoPrice} coins / min
        </Text>
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Display name</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
        value={name}
        onChangeText={setName}
        placeholder="Your host name"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={[styles.label, { color: colors.text }]}>Country</Text>
      <Pressable
        style={[
          styles.input,
          { backgroundColor: colors.bgCard, borderColor: colors.border },
        ]}
        onPress={() => {
          setShowCountries((v) => !v);
          setCountryQuery('');
        }}
      >
        <Text style={{ color: country ? colors.text : colors.textMuted }}>
          {country || 'Select country'}
        </Text>
      </Pressable>
      {showCountries ? (
        <View
          style={[
            styles.countryBox,
            { backgroundColor: colors.bgElevated, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[
              styles.searchInput,
              { color: colors.text, borderBottomColor: colors.border },
            ]}
            value={countryQuery}
            onChangeText={setCountryQuery}
            placeholder="Search countries…"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <ScrollView
            style={styles.countryList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {filteredCountries.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.countryItem,
                  { borderBottomColor: colors.border },
                  country === c && { backgroundColor: `${colors.primary}28` },
                ]}
                onPress={() => {
                  setCountry(c);
                  setShowCountries(false);
                }}
              >
                <Text style={{ color: colors.text }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>
        Photos · {photoUrls.length}/{MAX_PHOTOS} (min 1)
      </Text>
      <View style={styles.grid}>
        {photoUrls.map((uri, index) => (
          <View
            key={`${uri}_${index}`}
            style={[styles.thumbWrap, { backgroundColor: colors.bgCard }]}
          >
            <Image source={{ uri }} style={styles.thumb} />
            {index === 0 ? (
              <View style={[styles.mainBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.mainBadgeText}>Main</Text>
              </View>
            ) : null}
            <Pressable
              style={styles.removeBtn}
              onPress={() => removePhoto(uri)}
              hitSlop={8}
            >
              <X size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {photoUrls.length < MAX_PHOTOS ? (
          <Pressable
            style={[
              styles.addTile,
              { borderColor: colors.border, backgroundColor: colors.bgCard },
            ]}
            onPress={() => void pickPhotos()}
          >
            <Plus size={28} color={colors.primarySoft} />
            <Text style={[styles.addText, { color: colors.textSecondary }]}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.label, { color: colors.text }]}>
        Intro video <Text style={{ fontWeight: '500' }}>(optional)</Text>
      </Text>
      <Pressable
        style={[
          styles.mediaBox,
          { borderColor: colors.border, backgroundColor: colors.bgCard },
        ]}
        onPress={() => void pickVideo()}
      >
        {videoUrl ? (
          <View style={styles.videoPreviewWrap}>
            <ExpoVideo
              source={{ uri: videoUrl }}
              style={styles.videoPreview}
              useNativeControls
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
            />
            <Text style={[styles.mediaText, { color: colors.online, marginTop: 8 }]}>
              Video ready · tap to replace
            </Text>
          </View>
        ) : (
          <>
            <Video size={28} color={colors.primarySoft} />
            <Text style={[styles.mediaText, { color: colors.textSecondary }]}>
              Optional · skip if you want
            </Text>
          </>
        )}
      </Pressable>

      <Text style={[styles.label, { color: colors.text }]}>
        Bio <Text style={{ fontWeight: '500' }}>(optional)</Text>
      </Text>
      <TextInput
        style={[
          styles.input,
          styles.bio,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
        value={bio}
        onChangeText={setBio}
        placeholder="Tell callers about your vibe…"
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Text style={[styles.label, { color: colors.text }]}>Languages</Text>
      <View style={styles.chips}>
        {LANGUAGES.map((lang) => {
          const on = languages.includes(lang);
          return (
            <Pressable
              key={lang}
              onPress={() => toggleChip(languages, setLanguages, lang)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? `${colors.primary}33` : colors.bgCard,
                  borderColor: on ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: on ? colors.primarySoft : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {lang}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Categories</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((cat) => {
          const on = categories.includes(cat);
          return (
            <Pressable
              key={cat}
              onPress={() => toggleChip(categories, setCategories, cat)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? `${colors.primary}33` : colors.bgCard,
                  borderColor: on ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: on ? colors.primarySoft : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? (
        <Text style={[styles.hint, { color: colors.accent, marginTop: 12 }]}>
          {stageLabel(uploadStage)}
        </Text>
      ) : null}

      <Pressable
        style={[
          styles.submit,
          { backgroundColor: colors.primary },
          loading && styles.disabled,
        ]}
        onPress={() => void onSubmit()}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit for approval</Text>
        )}
      </Pressable>

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={[styles.signOutText, { color: colors.textMuted }]}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 30, fontWeight: '800' },
  sub: { marginTop: 8, marginBottom: 16, lineHeight: 21 },
  priceCard: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 8,
  },
  priceLabel: { fontWeight: '600', fontSize: 12 },
  priceValue: { fontWeight: '900', fontSize: 22, marginTop: 4 },
  label: { fontWeight: '700', marginBottom: 8, marginTop: 10 },
  hint: { fontSize: 12, marginTop: -4, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  bio: { minHeight: 90, textAlignVertical: 'top' },
  countryBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    fontSize: 15,
    minHeight: 48,
  },
  countryList: { maxHeight: 220 },
  countryItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  mainBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mainBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: { fontWeight: '700', fontSize: 12 },
  mediaBox: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mediaText: { marginTop: 8, fontWeight: '600', textAlign: 'center' },
  videoPreviewWrap: { width: '100%', alignItems: 'center' },
  videoPreview: { width: '100%', height: 180, borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  error: { marginTop: 14, fontWeight: '700' },
  submit: {
    marginTop: 20,
    borderRadius: radii.lg,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.7 },
  signOut: { marginTop: 16, minHeight: 44, justifyContent: 'center' },
  signOutText: { fontWeight: '700', textAlign: 'center' },
});
