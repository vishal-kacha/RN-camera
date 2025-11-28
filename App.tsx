import React, { useEffect, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  PermissionsAndroid,
  Platform,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CameraXView,
  CameraXModule,
  addListeners as addCameraXListeners,
} from './CameraXView';

type RecordingMode = 'standard' | 'circular';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [recording, setRecording] = useState(false);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('standard');
  const [preBufferDuration, setPreBufferDuration] = useState(5000); // 5 seconds
  const [postBufferDuration, setPostBufferDuration] = useState(5000); // 5 seconds
  const [telemetryReport, setTelemetryReport] = useState<string>('');
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [permissionsStatus, setPermissionsStatus] = useState<{
    [key: string]: string;
  }>({});

  // Ask for Android permissions
  useEffect(() => {
    if (Platform.OS === 'android') {
      requestPermissions();
      // Check permissions status after requesting
      checkPermissionsStatus();
    }

    addCameraXListeners({
      onRecordingStarted: () => {
        console.log('Recording started');
        setRecording(true);
      },
      onRecordingStopped: uri => {
        console.log('Saved to:', uri);
        setSavedUri(uri);
        setRecording(false);
        Alert.alert('Success', `Video saved to gallery!`);
      },
      onError: err => {
        console.log('Camera Error:', err);
        setRecording(false);
        Alert.alert('Error', err || 'Recording failed');
      },
    });
  }, []);

  const requestPermissions = async () => {
    try {
      const androidVersion = Platform.Version;
      const permissions = [
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      // Only request storage permissions on Android 9 and below
      // Android 10+ uses Scoped Storage (no permission needed for MediaStore)
      if (androidVersion <= 28) {
        permissions.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      const allGranted = Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED,
      );

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'Camera and audio permissions are required to record videos.',
          [{ text: 'OK' }],
        );
      } else {
        console.log('All permissions granted');
      }
    } catch (err) {
      console.warn('Permission request error:', err);
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const checkPermissionsStatus = async () => {
    try {
      const androidVersion = Platform.Version;
      const status: { [key: string]: string } = {};

      status.camera = (await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ))
        ? 'granted'
        : 'denied';

      status.audio = (await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ))
        ? 'granted'
        : 'denied';

      if (androidVersion <= 28) {
        status.storage = (await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ))
          ? 'granted'
          : 'denied';
      } else {
        status.storage = 'not required (Android 10+)';
      }

      setPermissionsStatus(status);
      console.log('Permissions Status:', status);
    } catch (err) {
      console.warn('Error checking permissions:', err);
    }
  };

  const handleStartRecording = () => {
    if (recordingMode === 'standard') {
      CameraXModule.startRecording();
    } else {
      CameraXModule.startCircularBufferRecording();
    }
  };

  const handleStopRecording = () => {
    if (recordingMode === 'standard') {
      CameraXModule.stopRecording();
    } else {
      CameraXModule.stopCircularBufferRecording();
    }
  };

  const updatePreBuffer = (duration: number) => {
    setPreBufferDuration(duration);
    CameraXModule.setPreBufferDuration(duration);
  };

  const updatePostBuffer = (duration: number) => {
    setPostBufferDuration(duration);
    CameraXModule.setPostBufferDuration(duration);
  };

  const fetchTelemetryReport = async () => {
    try {
      const report = await CameraXModule.getTelemetryReport();
      setTelemetryReport(report);
      setShowTelemetry(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch telemetry report');
    }
  };

  return (
    <View style={styles.container}>
      {/* Native Camera Preview */}
      <CameraXView style={styles.preview} />

      {/* Controls Overlay */}
      <View style={styles.controls}>
        {/* Recording Mode Toggle */}
        <View style={styles.modeSelector}>
          <Text style={styles.label}>Recording Mode:</Text>
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                recordingMode === 'standard' && styles.modeButtonActive,
              ]}
              onPress={() => setRecordingMode('standard')}
              disabled={recording}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  recordingMode === 'standard' && styles.modeButtonTextActive,
                ]}
              >
                Standard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                recordingMode === 'circular' && styles.modeButtonActive,
              ]}
              onPress={() => setRecordingMode('circular')}
              disabled={recording}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  recordingMode === 'circular' && styles.modeButtonTextActive,
                ]}
              >
                Circular Buffer
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Circular Buffer Settings */}
        {recordingMode === 'circular' && (
          <View style={styles.bufferSettings}>
            <View style={styles.bufferRow}>
              <Text style={styles.label}>Pre-Record:</Text>
              <View style={styles.durationButtons}>
                {[3000, 5000, 10000].map(duration => (
                  <TouchableOpacity
                    key={`pre-${duration}`}
                    style={[
                      styles.durationButton,
                      preBufferDuration === duration &&
                        styles.durationButtonActive,
                    ]}
                    onPress={() => updatePreBuffer(duration)}
                    disabled={recording}
                  >
                    <Text style={styles.durationText}>{duration / 1000}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.bufferRow}>
              <Text style={styles.label}>Post-Record:</Text>
              <View style={styles.durationButtons}>
                {[3000, 5000, 10000].map(duration => (
                  <TouchableOpacity
                    key={`post-${duration}`}
                    style={[
                      styles.durationButton,
                      postBufferDuration === duration &&
                        styles.durationButtonActive,
                    ]}
                    onPress={() => updatePostBuffer(duration)}
                    disabled={recording}
                  >
                    <Text style={styles.durationText}>{duration / 1000}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Record Button */}
        <TouchableOpacity
          style={[styles.recordButton, recording && styles.recordButtonActive]}
          onPress={recording ? handleStopRecording : handleStartRecording}
        >
          <Text style={styles.recordButtonText}>
            {recording ? '⏹ Stop' : '⏺ Record'}
          </Text>
        </TouchableOpacity>

        {/* Telemetry Button */}
        <TouchableOpacity
          style={styles.telemetryButton}
          onPress={fetchTelemetryReport}
        >
          <Text style={styles.telemetryButtonText}>📊 View Telemetry</Text>
        </TouchableOpacity>

        {/* Debug: Show Permissions Status */}
        {/*{Object.keys(permissionsStatus).length > 0 && (
          <View style={styles.permissionsDebug}>
            <Text style={styles.debugTitle}>Permissions Status:</Text>
            {Object.entries(permissionsStatus).map(([key, value]) => (
              <Text key={key} style={styles.debugText}>
                {key}:{' '}
                {value === 'granted'
                  ? '✓'
                  : value === 'not required (Android 10+)'
                  ? '✓'
                  : '✗'}{' '}
                {value}
              </Text>
            ))}
            <TouchableOpacity
              style={styles.recheckButton}
              onPress={checkPermissionsStatus}
            >
              <Text style={styles.recheckButtonText}>🔄 Recheck</Text>
            </TouchableOpacity>
          </View>
        )}*/}

        {/* Status Message */}
        {savedUri && (
          <Text style={styles.message}>✓ Video saved to gallery</Text>
        )}
        {recording && (
          <Text style={styles.recordingIndicator}>
            🔴 Recording{' '}
            {recordingMode === 'circular' ? '(Circular Buffer)' : ''}
          </Text>
        )}
      </View>

      {/* Telemetry Report Modal */}
      {showTelemetry && (
        <View style={styles.telemetryOverlay}>
          <View style={styles.telemetryModal}>
            <View style={styles.telemetryHeader}>
              <Text style={styles.telemetryTitle}>Performance Report</Text>
              <TouchableOpacity onPress={() => setShowTelemetry(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.telemetryContent}>
              <Text style={styles.telemetryText}>{telemetryReport}</Text>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
    backgroundColor: 'black',
  },
  controls: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modeSelector: {
    marginBottom: 16,
  },
  label: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  modeButtonText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modeButtonTextActive: {
    color: 'white',
  },
  bufferSettings: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  bufferRow: {
    marginBottom: 12,
  },
  durationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  durationButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  durationButtonActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  durationText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  recordButton: {
    paddingVertical: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    marginBottom: 12,
  },
  recordButtonActive: {
    backgroundColor: '#FF9500',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  telemetryButton: {
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  telemetryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    color: '#34C759',
    padding: 12,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  recordingIndicator: {
    color: '#FF3B30',
    padding: 12,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  telemetryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  telemetryModal: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  telemetryTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    color: 'white',
    fontSize: 24,
    fontWeight: '300',
  },
  telemetryContent: {
    padding: 16,
  },
  telemetryText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  permissionsDebug: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  debugTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  debugText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginBottom: 4,
  },
  recheckButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  recheckButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default App;
