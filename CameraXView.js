import {
  requireNativeComponent,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';

export const CameraXView = requireNativeComponent('CameraXView');
export const CameraXModule = NativeModules.CameraXModule;

const emitter = new NativeEventEmitter(CameraXModule);

export const addListeners = handlers => {
  emitter.addListener('onRecordingStarted', handlers.onRecordingStarted);
  emitter.addListener('onRecordingStopped', handlers.onRecordingStopped);
  emitter.addListener('onError', handlers.onError);
};
