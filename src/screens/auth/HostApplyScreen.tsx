import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

const MAX_PHOTOS = 8;

export function HostApplyScreen() {
  const insets = useSafeAreaInsets();
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
      notify('Submitted 💖', 'Your host ID is ready. Wait for admin approval.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand}>Become a Host</Text>
      <Text style={styles.sub}>
        {user?.hostStatus === 'rejected'
          ? 'Your last application was declined. Update photos/video and submit again.'
          : 'Submit your beauty profile. You cannot start hosting until we approve your ID.'}
      </Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your host name"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Country</Text>
      <Pressable
        style={styles.input}
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
        <View style={styles.countryBox}>
          <TextInput
            style={styles.searchInput}
            value={countryQuery}
            onChangeText={setCountryQuery}
            placeholder="Type to search all countries…"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <ScrollView style={styles.countryList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filteredCountries.length === 0 ? (
              <Text style={styles.emptyCountry}>No country found</Text>
            ) : (
              filteredCountries.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.countryItem, country === c && styles.countryItemOn]}
                  onPress={() => {
                    setCountry(c);
                    setShowCountries(false);
                    setCountryQuery('');
                  }}
                >
                  <Text style={styles.countryText}>{c}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}

      <Text style={styles.label}>
        Photos · {photoUrls.length}/{MAX_PHOTOS} (min 2)
      </Text>
      <Text style={styles.hint}>First photo is your main profile picture</Text>

      <View style={styles.grid}>
        {photoUrls.map((uri, index) => (
          <View key={`${uri}_${index}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} />
            {index === 0 ? (
              <View style={styles.mainBadge}>
                <Text style={styles.mainBadgeText}>Main</Text>
              </View>
            ) : null}
            <Pressable style={styles.removeBtn} onPress={() => removePhoto(uri)}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}

        {photoUrls.length < MAX_PHOTOS ? (
          <Pressable style={styles.addTile} onPress={pickPhotos}>
            <Ionicons name="add" size={28} color={colors.primarySoft} />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.addMore} onPress={pickPhotos}>
        <Ionicons name="images" size={18} color={colors.primarySoft} />
        <Text style={styles.addMoreText}>Add multiple photos</Text>
      </Pressable>

      <Text style={styles.label}>Intro video (max 60s)</Text>
      <Pressable style={styles.mediaBox} onPress={pickVideo}>
        <Ionicons
          name={videoUrl ? 'checkmark-circle' : 'videocam'}
          size={28}
          color={videoUrl ? colors.online : colors.primarySoft}
        />
        <Text style={styles.mediaText}>
          {videoUrl ? 'Intro video selected ✓' : 'Upload smile intro video'}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.submit, loading && styles.disabled]}
        onPress={onSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit for approval</Text>
        )}
      </Pressable>

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  brand: { color: colors.text, fontSize: 30, fontWeight: '800' },
  sub: { color: colors.textSecondary, marginTop: 8, marginBottom: 22, lineHeight: 21 },
  label: { color: colors.text, fontWeight: '700', marginBottom: 8, marginTop: 10 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: -4, marginBottom: 10 },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  countryBox: {
    marginTop: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  searchInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    fontSize: 15,
  },
  countryList: {
    maxHeight: 220,
  },
  countryItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countryItemOn: {
    backgroundColor: 'rgba(232,90,140,0.18)',
  },
  countryText: { color: colors.text },
  emptyCountry: {
    color: colors.textMuted,
    padding: 16,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  thumbWrap: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.bgCard,
  },
  thumb: { width: '100%', height: '100%' },
  mainBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mainBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  addMore: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(232,90,140,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,90,140,0.35)',
  },
  addMoreText: { color: colors.primarySoft, fontWeight: '800' },
  mediaBox: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  mediaText: { color: colors.textSecondary, fontWeight: '600' },
  error: { color: colors.danger, marginTop: 14 },
  submit: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  signOut: { marginTop: 18, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontWeight: '700' },
});
