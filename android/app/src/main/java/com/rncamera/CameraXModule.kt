package com.rncamera

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class CameraXModule(private val reactContext: ReactApplicationContext) :
        ReactContextBaseJavaModule(reactContext) {

    private val TAG = "CameraXModule"

    override fun getName(): String = "CameraXModule"

    private fun getView(): CameraXView? = CameraXViewManager.lastCreatedView

    @ReactMethod
    fun startRecording() {
        Log.d(TAG, "startRecording called")
        UiThreadUtil.runOnUiThread {
            val view = getView()
            if (view == null) {
                Log.e(TAG, "Camera view is null!")
            } else {
                view.startRecording()
            }
        }
    }

    @ReactMethod
    fun stopRecording() {
        Log.d(TAG, "stopRecording called")
        UiThreadUtil.runOnUiThread { getView()?.stopRecording() }
    }

    @ReactMethod
    fun startCircularBufferRecording() {
        Log.d(TAG, "startCircularBufferRecording called")
        UiThreadUtil.runOnUiThread { getView()?.startCircularBufferRecording() }
    }

    @ReactMethod
    fun stopCircularBufferRecording() {
        Log.d(TAG, "stopCircularBufferRecording called")
        UiThreadUtil.runOnUiThread { getView()?.stopCircularBufferRecording() }
    }

    @ReactMethod
    fun setPreBufferDuration(durationMs: Double) {
        Log.d(TAG, "setPreBufferDuration: $durationMs ms")
        UiThreadUtil.runOnUiThread { getView()?.setPreBufferDuration(durationMs.toLong()) }
    }

    @ReactMethod
    fun setPostBufferDuration(durationMs: Double) {
        Log.d(TAG, "setPostBufferDuration: $durationMs ms")
        UiThreadUtil.runOnUiThread { getView()?.setPostBufferDuration(durationMs.toLong()) }
    }

    @ReactMethod
    fun getTelemetryReport(promise: Promise) {
        try {
            val view = getView()
            val report = view?.getTelemetryReport() ?: "No telemetry data available"
            promise.resolve(report)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting telemetry report", e)
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RCTEventEmitter
        Log.d(TAG, "Listener added: $eventName")
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RCTEventEmitter
        Log.d(TAG, "Listeners removed: $count")
    }
}
