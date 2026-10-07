import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Language =
  | "English"
  | "French"
  | "Punjabi"
  | "Tamil";

const SERVER_URL = "https://speech-helper.onrender.com";

export default function SpeechHelper() {
  const [heardText, setHeardText] =
    useState("");

  const [clearText, setClearText] =
    useState("");

  const [language, setLanguage] =
    useState<Language>("English");

  const [isThinking, setIsThinking] =
    useState(false);

  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY
  );

  const recorderState =
    useAudioRecorderState(recorder);

  // AI voice player
  const player = useAudioPlayer(null, {
    downloadFirst: true,
  });

  useEffect(() => {
    setupAudio();
  }, []);

  // ========================================
  // AUDIO SETUP
  // ========================================

  const setupAudio = async () => {
    try {
      const permission =
        await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Microphone Permission",
          "Speech Helper needs microphone access."
        );

        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
    } catch (error) {
      console.log(
        "Audio setup error:",
        error
      );
    }
  };

  // ========================================
  // START RECORDING
  // ========================================

  const startRecording = async () => {
    try {
      player.pause();

      setHeardText("");
      setClearText("");

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();

      recorder.record();
    } catch (error) {
      console.log(
        "Recording start error:",
        error
      );

      Alert.alert(
        "Recording Error",
        String(error)
      );
    }
  };

  // ========================================
  // STOP RECORDING + AI TRANSCRIPTION
  // ========================================

  const stopRecording = async () => {
    try {
      setIsThinking(true);

      await recorder.stop();

      const uri = recorder.uri;

      if (!uri) {
        throw new Error(
          "No recording file was created."
        );
      }

      console.log(
        "Recording URI:",
        uri
      );

      const audioResponse =
        await fetch(uri);

      const audioBlob =
        await audioResponse.blob();

      console.log(
        "Audio size:",
        audioBlob.size
      );

      const formData = new FormData();

      formData.append(
        "audio",
        audioBlob,
        "speech.m4a"
      );

      const response = await fetch(
        `${SERVER_URL}/transcribe`,
        {
          method: "POST",
          body: formData,
        }
      );

      const responseText =
        await response.text();

      console.log(
        "Transcription server response:",
        responseText
      );

      if (!response.ok) {
        throw new Error(
          `Server ${response.status}: ${responseText}`
        );
      }

      const data =
        JSON.parse(responseText);

      const transcript =
        data.heardText?.trim();

      if (!transcript) {
        throw new Error(
          "AI returned an empty transcription."
        );
      }

      setHeardText(transcript);

      await getClearSentence(
        transcript,
        language,
        true
      );
    } catch (error) {
      console.log(
        "Transcription error:",
        error
      );

      Alert.alert(
        "AI Recognition Error",
        String(error)
      );

      setIsThinking(false);
    }
  };

  // ========================================
  // CLEAR SENTENCE / TRANSLATION
  // ========================================

  const getClearSentence = async (
    text: string,
    selectedLanguage: Language,
    speakAutomatically: boolean
  ) => {
    try {
      setIsThinking(true);

      const response = await fetch(
        `${SERVER_URL}/clarify`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            text: text,
            language:
              selectedLanguage,
          }),
        }
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        throw new Error(
          `Server ${response.status}: ${responseText}`
        );
      }

      const data =
        JSON.parse(responseText);

      const sentence =
        data.clearSentence?.trim();

      if (!sentence) {
        throw new Error(
          "No clear sentence was returned."
        );
      }

      setClearText(sentence);

      if (speakAutomatically) {
        await speakSentence(sentence);
      }
    } catch (error) {
      console.log(
        "Clarify error:",
        error
      );

      Alert.alert(
        "AI Error",
        String(error)
      );
    } finally {
      setIsThinking(false);
    }
  };

  // ========================================
  // OPENAI VOICE
  // ========================================

  const speakSentence = async (
    sentence: string
  ) => {
    try {
      if (!sentence.trim()) {
        return;
      }

      player.pause();

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const voiceURL =
        `${SERVER_URL}/speak?text=` +
        encodeURIComponent(sentence);

      console.log(
        "AI voice URL:",
        voiceURL
      );

      player.replace(voiceURL);

      player.play();
    } catch (error) {
      console.log(
        "AI voice error:",
        error
      );

      Alert.alert(
        "Voice Error",
        String(error)
      );
    }
  };

  // ========================================
  // CHANGE LANGUAGE
  // ========================================

  const changeLanguage = async (
    newLanguage: Language
  ) => {
    try {
      player.pause();

      setLanguage(newLanguage);

      if (heardText.trim()) {
        await getClearSentence(
          heardText,
          newLanguage,
          true
        );
      }
    } catch (error) {
      console.log(
        "Language error:",
        error
      );
    }
  };

  // ========================================
  // RESET
  // ========================================

  const resetApp = () => {
    player.pause();

    setHeardText("");
    setClearText("");
    setLanguage("English");
    setIsThinking(false);
  };

  // ========================================
  // UI
  // ========================================

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >
        <Text style={styles.title}>
          Speech Helper
        </Text>

        <Text style={styles.subtitle}>
          ✨ AI Voice Recognition
        </Text>

        {/* WHAT AI HEARD */}

        <View style={styles.card}>
          <Text style={styles.label}>
            What AI heard
          </Text>

          <Text style={styles.resultText}>
            {heardText ||
              "Your speech will appear here."}
          </Text>
        </View>

        {/* LANGUAGES */}

        <Text style={styles.sectionTitle}>
          Output Language
        </Text>

        <View
          style={
            styles.languageContainer
          }
        >
          {(
            [
              "English",
              "French",
              "Punjabi",
              "Tamil",
            ] as Language[]
          ).map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.languageButton,

                language === item &&
                  styles.languageButtonSelected,
              ]}
              onPress={() =>
                changeLanguage(item)
              }
            >
              <Text
                style={[
                  styles.languageText,

                  language === item &&
                    styles.languageTextSelected,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CLEAR SENTENCE */}

        <View style={styles.card}>
          <Text style={styles.label}>
            Clear sentence • {language}
          </Text>

          <Text style={styles.clearText}>
            {clearText ||
              "Your clear sentence will appear here."}
          </Text>
        </View>

        {/* THINKING */}

        {isThinking && (
          <View
            style={
              styles.thinkingContainer
            }
          >
            <ActivityIndicator
              size="large"
            />

            <Text
              style={
                styles.thinkingText
              }
            >
              AI is thinking...
            </Text>
          </View>
        )}

        {/* RECORD BUTTON */}

        <TouchableOpacity
          style={[
            styles.mainButton,

            recorderState.isRecording &&
              styles.stopButton,
          ]}
          onPress={
            recorderState.isRecording
              ? stopRecording
              : startRecording
          }
          disabled={isThinking}
        >
          <Text
            style={
              styles.mainButtonText
            }
          >
            {recorderState.isRecording
              ? "■ Stop Speaking"
              : "🎤 Start Speaking"}
          </Text>
        </TouchableOpacity>

        {/* SPEAK AGAIN */}

        <TouchableOpacity
          style={styles.speakButton}
          onPress={() =>
            speakSentence(clearText)
          }
          disabled={
            !clearText || isThinking
          }
        >
          <Text
            style={
              styles.speakButtonText
            }
          >
            🔊 Speak Again
          </Text>
        </TouchableOpacity>

        {/* RESET */}

        <TouchableOpacity
          style={styles.resetButton}
          onPress={resetApp}
        >
          <Text
            style={
              styles.resetButtonText
            }
          >
            Reset
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },

  container: {
    padding: 22,
    paddingBottom: 50,
  },

  title: {
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 15,
    color: "#1f2937",
  },

  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 7,
    marginBottom: 25,
    color: "#6b7280",
  },

  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 20,
    marginBottom: 22,
    elevation: 3,
  },

  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 10,
  },

  resultText: {
    fontSize: 21,
    color: "#111827",
    lineHeight: 30,
  },

  clearText: {
    fontSize: 23,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 33,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
    color: "#374151",
  },

  languageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 22,
  },

  languageButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "#e5e7eb",
  },

  languageButtonSelected: {
    backgroundColor: "#2563eb",
  },

  languageText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },

  languageTextSelected: {
    color: "white",
  },

  thinkingContainer: {
    alignItems: "center",
    marginBottom: 20,
  },

  thinkingText: {
    marginTop: 8,
    color: "#6b7280",
  },

  mainButton: {
    backgroundColor: "#2563eb",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 14,
  },

  stopButton: {
    backgroundColor: "#dc2626",
  },

  mainButtonText: {
    color: "white",
    fontSize: 19,
    fontWeight: "700",
  },

  speakButton: {
    backgroundColor: "#10b981",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 14,
  },

  speakButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },

  resetButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },

  resetButtonText: {
    color: "#4b5563",
    fontSize: 17,
    fontWeight: "600",
  },
});