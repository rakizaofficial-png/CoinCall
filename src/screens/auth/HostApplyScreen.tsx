import * as ImagePicker from 'expo-image-picker';
import { CheckCircle2, Images, Plus, Video, X } from 'lucide-react-native';
import { useState } from 'react';
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
import { notify } from '../../utils/notify';

const MAX_PHOTOS = 8;

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
  const [showCountries, setShowCountries] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      notify('Permission', 'Please allow photo access to upload your pictures.');
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
      const next = [...photoUrls, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS);
      setPhotoUrls(next);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotoUrls((list) => list.filter((p) => p !== uri));
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Please allow video access to upload your intro.');
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

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await submitHostApplication({ name, country, photoUrls, videoUrl });
      notify('Submitted', 'Your host ID is ready. Wait for admin approval.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setLoading(false);
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
        {user?.hostStatus === 'rejected'
          ? 'Your last application was declined. Update photos/video and submit again.'
          : 'Submit your beauty profile. You cannot start hosting until we approve your ID.'}
      </Text>

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
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
          },
        ]}
        onPress={() => {
          setShowCountries((v) => !v);
          setCountryQuery('');
        }}
      >
        <Text style={{ color: country ? colors.text : colors.textMuted }}>
          {country || 'Search & select country'}
        </Text>
      </Pressable>
      {showCountries ? (
        <View
          style={[
            styles.countryBox,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <TextInput
            style={[
              styles.searchInput,
              { color: colors.text, borderBottomColor: colors.border },
            ]}
            value={countryQuery}
            onChangeText={setCountryQuery}
            placeholder="Type to search all countries…"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <ScrollView
            style={styles.countryList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {filteredCountries.length === 0 ? (
              <Text style={[styles.emptyCountry, { color: colors.textMuted }]}>
                No country found
              </Text>
            ) : (
              filteredCountries.map((c) => (
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
                    setCountryQuery('');
                  }}
                >
                  <Text style={{ color: colors.text }}>{c}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>
        Photos · {photoUrls.length}/{MAX_PHOTOS} (min 2)
      </Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        First photo is your main profile picture
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
              accessibilityLabel="Remove photo"
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
            onPress={pickPhotos}
          >
            <Plus size={28} color={colors.primarySoft} />
            <Text style={[styles.addText, { color: colors.textSecondary }]}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        style={[
          styles.addMore,
          {
            backgroundColor: `${colors.primary}18`,
            borderColor: `${colors.primary}55`,
          },
        ]}
        onPress={pickPhotos}
      >
        <Images size={18} color={colors.primarySoft} />
        <Text style={[styles.addMoreText, { color: colors.primarySoft }]}>
          Add multiple photos
        </Text>
      </Pressable>

      <Text style={[styles.label, { color: colors.text }]}>Intro video (max 60s)</Text>
      <Pressable
        style={[
          styles.mediaBox,
          { borderColor: colors.border, backgroundColor: colors.bgCard },
        ]}
        onPress={pickVideo}
      >
        {videoUrl ? (
          <CheckCircle2 size={28} color={colors.online} />
        ) : (
          <Video size={28} color={colors.primarySoft} />
        )}
        <Text style={[styles.mediaText, { color: colors.textSecondary }]}>
          {videoUrl ? 'Intro video selected' : 'Upload smile intro video'}
        </Text>
      </Pressable>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Pressable
        style={[
          styles.submit,
          { backgroundColor: colors.primary },
          loading && styles.disabled,
        ]}
        onPress={onSubmit}
        disabled={loading}
        accessibilityRole="button"
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
  sub: { marginTop: 8, marginBottom: 22, lineHeight: 21 },
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
  emptyCountry: { padding: 16, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: { width: '100%', height: '100%' },
  mainBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mainBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
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
  addMore: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  addMoreText: { fontWeight: '800' },
  mediaBox: {
    minHeight: 120,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  mediaText: { fontWeight: '600' },
  error: { marginTop: 14 },
  submit: {
    marginTop: 24,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  signOut: { marginTop: 18, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  signOutText: { fontWeight: '700' },
});
