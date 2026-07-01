import { Audio, type AVPlaybackSource } from 'expo-av';

export async function playOneShotSound(source: AVPlaybackSource, volume = 1): Promise<void> {
  const { sound } = await Audio.Sound.createAsync(source, {
    shouldPlay: true,
    isLooping: false,
    volume,
  });

  sound.setOnPlaybackStatusUpdate((status) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      void sound.unloadAsync();
    }
  });
}

export async function prepareAudiblePlayback(): Promise<void> {
  await Audio.setIsEnabledAsync(true).catch(() => {});
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
    allowsRecordingIOS: false,
  });
}
