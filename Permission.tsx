import { useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

export default function PermissionsComponent() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      requestPermissions();
    }
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

  return null;
}
