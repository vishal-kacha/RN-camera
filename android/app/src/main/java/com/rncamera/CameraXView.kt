package com.rncamera

import android.content.ContentValues
import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import android.provider.MediaStore
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors

data class BufferedFrame(
        val data: ByteBuffer,
        val presentationTimeUs: Long,
        val isKeyFrame: Boolean
)

class CameraXView(context: Context) : FrameLayout(context) {
    private val previewView = PreviewView(context)
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null
    private lateinit var reactContext: ReactContext

    // Circular buffer components
    private val frameBuffer = ConcurrentLinkedQueue<BufferedFrame>()
    private var mediaCodec: MediaCodec? = null
    private var mediaMuxer: MediaMuxer? = null
    private var videoTrackIndex = -1
    private var audioTrackIndex = -1
    private val codecExecutor = Executors.newSingleThreadExecutor()

    // Configuration
    var preBufferDurationMs: Long = 5000 // 5 seconds default
    var postBufferDurationMs: Long = 5000 // 5 seconds default
    private val maxBufferSize = 150 // ~5 seconds at 30fps

    // Recording state
    private var isCircularBufferRecording = false
    private var recordingStartTime: Long = 0
    private var postRecordingStarted = false
    private var tempOutputFile: File? = null

    // Telemetry
    private val telemetryCollector = TelemetryCollector()

    init {
        if (context is ReactContext) {
            reactContext = context
        }
        addView(previewView)
        post { startCamera() }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener(
                {
                    val cameraProvider = cameraProviderFuture.get()

                    // Preview
                    val preview = androidx.camera.core.Preview.Builder().build()
                    preview.setSurfaceProvider(previewView.surfaceProvider)

                    // Video capture for standard recording
                    val recorder =
                            Recorder.Builder()
                                    .setQualitySelector(QualitySelector.from(Quality.HIGHEST))
                                    .build()
                    videoCapture = VideoCapture.withOutput(recorder)

                    val selector = CameraSelector.DEFAULT_BACK_CAMERA
                    val lifecycleOwner =
                            (context as? ReactContext)?.currentActivity as? LifecycleOwner
                                    ?: throw IllegalStateException("LifecycleOwner not found")

                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, videoCapture)

                    // Start telemetry collection
                    telemetryCollector.startMonitoring()
                },
                ContextCompat.getMainExecutor(context)
        )
    }

    // Standard recording (existing implementation)
    fun startRecording() {
        val startTime = System.currentTimeMillis()
        val vc = videoCapture ?: return

        val name = "VID_${System.currentTimeMillis()}.mp4"
        val values =
                ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        put(MediaStore.Video.Media.RELATIVE_PATH, "DCIM/Camera")
                    }
                }

        val outputOptions =
                MediaStoreOutputOptions.Builder(
                                context.contentResolver,
                                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                        )
                        .setContentValues(values)
                        .build()

        activeRecording =
                vc.output.prepareRecording(context, outputOptions).withAudioEnabled().start(
                                ContextCompat.getMainExecutor(context)
                        ) { event ->
                    when (event) {
                        is VideoRecordEvent.Start -> {
                            val latency = System.currentTimeMillis() - startTime
                            telemetryCollector.recordRecordingLatency(latency)
                            sendEvent("onRecordingStarted", null)
                        }
                        is VideoRecordEvent.Finalize -> {
                            if (event.hasError()) {
                                sendEvent("onError", event.cause?.message)
                            } else {
                                sendEvent(
                                        "onRecordingStopped",
                                        event.outputResults.outputUri.toString()
                                )
                            }
                            activeRecording = null
                        }
                    }
                }
    }

    fun stopRecording() {
        activeRecording?.stop()
    }

    // Circular buffer recording
    fun startCircularBufferRecording() {
        if (isCircularBufferRecording) return

        val startTime = System.currentTimeMillis()
        isCircularBufferRecording = true
        postRecordingStarted = false
        recordingStartTime = System.currentTimeMillis()

        // Create temp output file
        tempOutputFile = File(context.cacheDir, "temp_${System.currentTimeMillis()}.mp4")

        codecExecutor.execute {
            try {
                initializeEncoder()

                // Write buffered frames (pre-record)
                writeBufferedFrames()

                // Record post-trigger duration
                val postRecordEndTime = recordingStartTime + postBufferDurationMs
                while (System.currentTimeMillis() < postRecordEndTime) {
                    encodeFrame()
                }

                finalizeRecording()

                val latency = System.currentTimeMillis() - startTime
                telemetryCollector.recordRecordingLatency(latency)
                sendEvent("onRecordingStarted", null)
            } catch (e: Exception) {
                sendEvent("onError", e.message)
                isCircularBufferRecording = false
            }
        }
    }

    fun stopCircularBufferRecording() {
        if (!isCircularBufferRecording) return
        postRecordingStarted = true
    }

    private fun initializeEncoder() {
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, 1920, 1080)
        format.setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface
        )
        format.setInteger(MediaFormat.KEY_BIT_RATE, 6000000)
        format.setInteger(MediaFormat.KEY_FRAME_RATE, 30)
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)

        mediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        mediaCodec?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

        mediaMuxer =
                MediaMuxer(
                        tempOutputFile!!.absolutePath,
                        MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
                )
    }

    private fun writeBufferedFrames() {
        val bufferInfo = MediaCodec.BufferInfo()

        frameBuffer.forEach { frame ->
            bufferInfo.set(
                    0,
                    frame.data.remaining(),
                    frame.presentationTimeUs,
                    if (frame.isKeyFrame) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
            )

            if (videoTrackIndex >= 0) {
                mediaMuxer?.writeSampleData(videoTrackIndex, frame.data, bufferInfo)
            }
        }
    }

    private fun encodeFrame() {
        val codec = mediaCodec ?: return
        val bufferInfo = MediaCodec.BufferInfo()

        val outputBufferIndex = codec.dequeueOutputBuffer(bufferInfo, 10000)
        if (outputBufferIndex >= 0) {
            val outputBuffer = codec.getOutputBuffer(outputBufferIndex)

            if (outputBuffer != null && bufferInfo.size > 0) {
                // Add to circular buffer
                if (frameBuffer.size >= maxBufferSize) {
                    frameBuffer.poll()
                }

                val bufferedFrame =
                        BufferedFrame(
                                data = outputBuffer.duplicate(),
                                presentationTimeUs = bufferInfo.presentationTimeUs,
                                isKeyFrame =
                                        (bufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0
                        )
                frameBuffer.offer(bufferedFrame)

                // Write to muxer if recording
                if (videoTrackIndex >= 0) {
                    mediaMuxer?.writeSampleData(videoTrackIndex, outputBuffer, bufferInfo)
                }
            }

            codec.releaseOutputBuffer(outputBufferIndex, false)
        }
    }

    private fun finalizeRecording() {
        mediaCodec?.stop()
        mediaCodec?.release()
        mediaCodec = null

        mediaMuxer?.stop()
        mediaMuxer?.release()
        mediaMuxer = null

        // Save to gallery
        tempOutputFile?.let { file -> saveToGallery(file) }

        isCircularBufferRecording = false
        frameBuffer.clear()
    }

    private fun saveToGallery(file: File) {
        val values =
                ContentValues().apply {
                    put(
                            MediaStore.MediaColumns.DISPLAY_NAME,
                            "CircBuf_${System.currentTimeMillis()}.mp4"
                    )
                    put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        put(MediaStore.Video.Media.RELATIVE_PATH, "DCIM/Camera")
                    }
                }

        val uri =
                context.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)

        uri?.let { targetUri ->
            context.contentResolver.openOutputStream(targetUri)?.use { output ->
                file.inputStream().use { input -> input.copyTo(output) }
            }
            file.delete()
            sendEvent("onRecordingStopped", targetUri.toString())
        }
    }

    fun setPreBufferDuration(durationMs: Long) {
        preBufferDurationMs = durationMs
        // Adjust buffer size based on duration (assuming 30fps)
        val newMaxSize = (durationMs / 1000.0 * 30).toInt()
        // maxBufferSize update would require managing the queue
    }

    fun setPostBufferDuration(durationMs: Long) {
        postBufferDurationMs = durationMs
    }

    fun getTelemetryReport(): String {
        return telemetryCollector.generateReport()
    }

    private fun sendEvent(eventName: String, data: String?) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
    }

    fun cleanup() {
        telemetryCollector.stopMonitoring()
        codecExecutor.shutdown()
    }
}
