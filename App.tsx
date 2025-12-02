import React, { useEffect, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  Pressable,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CameraXView,
  CameraXModule,
  addListeners as addCameraXListeners,
} from './CameraXView';
import PermissionsComponent from './Permission';

type RecordingMode = 'standard' | 'circular';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <PermissionsComponent />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [recording, setRecording] = useState(false);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('standard');
  const [bufferDuration, setBufferDuration] = useState(5000); // 5 seconds
  const [showBufferMenu, setShowBufferMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const predefinedDurations = [3000, 5000, 10000];

  // Setup CameraX listeners
  useEffect(() => {
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

  const updateBufferDuration = (duration: number) => {
    setBufferDuration(duration);
    CameraXModule.setPreBufferDuration(duration);
    CameraXModule.setPostBufferDuration(duration);
    setShowBufferMenu(false);
  };

  const handleCustomDuration = () => {
    const val = parseInt(customValue);
    if (val > 0) {
      const durationMs = val * 1000;
      updateBufferDuration(durationMs);
    }
    setShowCustomModal(false);
    setCustomValue('');
  };

  return (
    <View style={styles.container}>
      {/* Native Camera Preview */}
      <CameraXView style={styles.cameraPreview} />

      {/* Bottom Container */}
      <View style={styles.bottomContainer}>
        {/* Recording Mode Dropdown - Left */}
        <View style={styles.leftDropdown}>
          <Pressable
            style={styles.dropdownButton}
            onPress={() => !recording && setShowModeMenu(!showModeMenu)}
            disabled={recording}
          >
            <Text style={styles.dropdownButtonText}>
              {recordingMode === 'standard' ? 'Standard' : 'Circular'} ▼
            </Text>
          </Pressable>
          {showModeMenu && (
            <View style={styles.dropdownMenu}>
              <Pressable
                style={styles.dropdownItem}
                onPress={() => {
                  setRecordingMode('standard');
                  setShowModeMenu(false);
                }}
              >
                <Text style={styles.dropdownItemText}>Standard</Text>
              </Pressable>
              <Pressable
                style={styles.dropdownItem}
                onPress={() => {
                  setRecordingMode('circular');
                  setShowModeMenu(false);
                }}
              >
                <Text style={styles.dropdownItemText}>Circular</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Buffer Duration Dropdown - Below Mode Selector (only for circular) */}
        {recordingMode === 'circular' && (
          <View style={styles.bufferContainer}>
            <Pressable
              style={styles.dropdownButton}
              onPress={() => !recording && setShowBufferMenu(!showBufferMenu)}
              disabled={recording}
            >
              <Text style={styles.dropdownButtonText}>
                {bufferDuration / 1000}s ▼
              </Text>
            </Pressable>
            {showBufferMenu && (
              <View style={styles.bufferMenu}>
                {predefinedDurations.map(duration => (
                  <Pressable
                    key={`buffer-${duration}`}
                    style={styles.dropdownItem}
                    onPress={() => updateBufferDuration(duration)}
                  >
                    <Text style={styles.dropdownItemText}>
                      {duration / 1000}s
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[
                    styles.dropdownItem,
                    { borderTopWidth: 1, borderTopColor: '#555' },
                  ]}
                  onPress={() => {
                    setShowBufferMenu(false);
                    setShowCustomModal(true);
                  }}
                >
                  <Text style={styles.dropdownItemText}>Custom…</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Camera Button - Centered */}
        <Pressable
          style={({ pressed }) => [
            styles.cameraButton,
            recording && styles.cameraButtonRecording,
            pressed && { opacity: 0.7 },
          ]}
          onPress={recording ? handleStopRecording : handleStartRecording}
          android_ripple={{ color: '#ccc', borderless: false }}
        >
          <View
            style={[
              styles.innerCircle,
              recording && styles.innerCircleRecording,
            ]}
          />
        </Pressable>

        {/* Status Message */}
        {savedUri && (
          <Text style={styles.statusMessage}>✓ Video saved to gallery</Text>
        )}
        {recording && (
          <Text style={styles.recordingIndicator}>
            🔴 Recording{' '}
            {recordingMode === 'circular' ? '(Circular Buffer)' : ''}
          </Text>
        )}
      </View>

      {/* Custom Input Modal */}
      <Modal transparent visible={showCustomModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter seconds</Text>
            <TextInput
              value={customValue}
              onChangeText={setCustomValue}
              keyboardType="numeric"
              style={styles.customInput}
              placeholder="e.g. 7"
              placeholderTextColor="#aaa"
            />
            <Pressable
              style={styles.modalButton}
              onPress={handleCustomDuration}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPreview: {
    flex: 1,
    backgroundColor: '#222',
  },
  bottomContainer: {
    alignItems: 'center',
    padding: 20,
    position: 'relative',
  },
  leftDropdown: {
    position: 'absolute',
    left: 20,
    top: 35,
    zIndex: 10,
  },
  dropdownButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  dropdownButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  dropdownMenu: {
    position: 'absolute',
    bottom: 45,
    left: 0,
    backgroundColor: '#333',
    paddingVertical: 5,
    borderRadius: 8,
    width: 120,
    zIndex: 100,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 16,
  },
  bufferContainer: {
    position: 'absolute',
    left: 20,
    top: 85,
    zIndex: 10,
  },
  bufferMenu: {
    position: 'absolute',
    bottom: 45,
    left: 0,
    backgroundColor: '#333',
    paddingVertical: 5,
    borderRadius: 8,
    width: 100,
    zIndex: 100,
  },
  cameraButton: {
    height: 80,
    width: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButtonRecording: {
    backgroundColor: '#FF3B30',
  },
  innerCircle: {
    height: 70,
    width: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
  },
  innerCircleRecording: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  statusMessage: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  recordingIndicator: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 200,
    backgroundColor: '#222',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    marginBottom: 10,
    fontSize: 16,
  },
  customInput: {
    width: 150,
    padding: 8,
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    color: '#fff',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#444',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#fff',
  },
});

export default App;
