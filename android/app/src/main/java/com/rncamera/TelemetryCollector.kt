package com.rncamera

import android.os.Debug
import android.os.Process
import android.util.Log
import java.io.RandomAccessFile
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

data class TelemetrySnapshot(
        val timestamp: Long,
        val cpuUsagePercent: Double,
        val memoryUsageMB: Double,
        val gpuUsagePercent: Double
)

class TelemetryCollector {
    private val snapshots = mutableListOf<TelemetrySnapshot>()
    private var monitoringTask: ScheduledFuture<*>? = null
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private var lastCpuTime: Long = 0
    private var lastAppCpuTime: Long = 0
    private var recordingLatencies = mutableListOf<Long>()

    private val TAG = "TelemetryCollector"

    fun startMonitoring() {
        // Initialize baseline CPU values
        lastCpuTime = getTotalCpuTime()
        lastAppCpuTime = getAppCpuTime()

        // Collect metrics every 500ms
        monitoringTask =
                executor.scheduleAtFixedRate({ collectMetrics() }, 0, 500, TimeUnit.MILLISECONDS)

        Log.d(TAG, "Telemetry monitoring started")
    }

    fun stopMonitoring() {
        monitoringTask?.cancel(false)
        executor.shutdown()
        Log.d(TAG, "Telemetry monitoring stopped")
    }

    private fun collectMetrics() {
        val snapshot =
                TelemetrySnapshot(
                        timestamp = System.currentTimeMillis(),
                        cpuUsagePercent = getCpuUsage(),
                        memoryUsageMB = getMemoryUsage(),
                        gpuUsagePercent = getGpuUsage()
                )

        synchronized(snapshots) {
            snapshots.add(snapshot)

            // Keep only last 1000 snapshots (~8 minutes at 500ms intervals)
            if (snapshots.size > 1000) {
                snapshots.removeAt(0)
            }
        }

        Log.d(
                TAG,
                "CPU: ${String.format("%.2f", snapshot.cpuUsagePercent)}%, " +
                        "Memory: ${String.format("%.2f", snapshot.memoryUsageMB)}MB, " +
                        "GPU: ${String.format("%.2f", snapshot.gpuUsagePercent)}%"
        )
    }

    private fun getCpuUsage(): Double {
        try {
            val currentTotalCpu = getTotalCpuTime()
            val currentAppCpu = getAppCpuTime()

            val totalDiff = currentTotalCpu - lastCpuTime
            val appDiff = currentAppCpu - lastAppCpuTime

            lastCpuTime = currentTotalCpu
            lastAppCpuTime = currentAppCpu

            if (totalDiff == 0L) return 0.0

            val cpuCores = Runtime.getRuntime().availableProcessors()
            val usage = (appDiff.toDouble() / totalDiff.toDouble()) * 100.0 * cpuCores

            return usage.coerceIn(0.0, 100.0)
        } catch (e: Exception) {
            Log.e(TAG, "Error calculating CPU usage", e)
            return 0.0
        }
    }

    private fun getTotalCpuTime(): Long {
        return try {
            RandomAccessFile("/proc/stat", "r").use { reader ->
                val line = reader.readLine()
                val parts = line.split("\\s+".toRegex())
                // Sum all CPU time values (user, nice, system, idle, etc.)
                parts.drop(1).take(8).sumOf { it.toLongOrNull() ?: 0L }
            }
        } catch (e: Exception) {
            0L
        }
    }

    private fun getAppCpuTime(): Long {
        return try {
            val pid = Process.myPid()
            RandomAccessFile("/proc/$pid/stat", "r").use { reader ->
                val line = reader.readLine()
                val parts = line.split("\\s+".toRegex())
                // utime (14th field) + stime (15th field)
                val utime = parts.getOrNull(13)?.toLongOrNull() ?: 0L
                val stime = parts.getOrNull(14)?.toLongOrNull() ?: 0L
                utime + stime
            }
        } catch (e: Exception) {
            0L
        }
    }

    private fun getMemoryUsage(): Double {
        return try {
            val memoryInfo = Debug.MemoryInfo()
            Debug.getMemoryInfo(memoryInfo)

            // Total PSS (Proportional Set Size) in KB
            val totalPssKb = memoryInfo.totalPss

            // Convert to MB
            totalPssKb / 1024.0
        } catch (e: Exception) {
            Log.e(TAG, "Error getting memory usage", e)
            0.0
        }
    }

    private fun getGpuUsage(): Double {
        // GPU usage on Android is difficult to measure accurately without root access
        // We'll use an approximation based on GPU frequency scaling
        return try {
            val gpuFreqFile = "/sys/class/kgsl/kgsl-3d0/gpuclk"
            val maxFreqFile = "/sys/class/kgsl/kgsl-3d0/max_gpuclk"

            val currentFreq = readLongFromFile(gpuFreqFile)
            val maxFreq = readLongFromFile(maxFreqFile)

            if (currentFreq > 0 && maxFreq > 0) {
                (currentFreq.toDouble() / maxFreq.toDouble()) * 100.0
            } else {
                // Alternative: estimate based on memory usage as proxy
                estimateGpuFromMemory()
            }
        } catch (e: Exception) {
            // Fallback to estimation
            estimateGpuFromMemory()
        }
    }

    private fun readLongFromFile(path: String): Long {
        return try {
            RandomAccessFile(path, "r").use { reader ->
                reader.readLine().trim().toLongOrNull() ?: 0L
            }
        } catch (e: Exception) {
            0L
        }
    }

    private fun estimateGpuFromMemory(): Double {
        // Rough estimation: assume GPU usage correlates with graphics memory
        // This is not accurate but provides some indication
        try {
            val runtime = Runtime.getRuntime()
            val usedMemory = runtime.totalMemory() - runtime.freeMemory()
            val maxMemory = runtime.maxMemory()

            // Use a fraction as GPU estimate (very rough approximation)
            val estimate = (usedMemory.toDouble() / maxMemory.toDouble()) * 50.0
            return estimate.coerceIn(0.0, 100.0)
        } catch (e: Exception) {
            return 0.0
        }
    }

    fun recordRecordingLatency(latencyMs: Long) {
        synchronized(recordingLatencies) { recordingLatencies.add(latencyMs) }
        Log.d(TAG, "Recording start latency: ${latencyMs}ms")
    }

    fun generateReport(): String {
        val report = StringBuilder()
        report.appendLine("=== TELEMETRY REPORT ===")
        report.appendLine()

        synchronized(snapshots) {
            if (snapshots.isEmpty()) {
                report.appendLine("No telemetry data collected yet.")
                return report.toString()
            }

            // CPU Statistics
            val cpuValues = snapshots.map { it.cpuUsagePercent }
            report.appendLine("CPU USAGE:")
            report.appendLine("  Average: ${String.format("%.2f", cpuValues.average())}%")
            report.appendLine("  Min: ${String.format("%.2f", cpuValues.minOrNull() ?: 0.0)}%")
            report.appendLine("  Max: ${String.format("%.2f", cpuValues.maxOrNull() ?: 0.0)}%")
            report.appendLine("  Cores: ${Runtime.getRuntime().availableProcessors()}")
            report.appendLine()

            // Memory Statistics
            val memValues = snapshots.map { it.memoryUsageMB }
            report.appendLine("MEMORY USAGE:")
            report.appendLine("  Average: ${String.format("%.2f", memValues.average())} MB")
            report.appendLine("  Min: ${String.format("%.2f", memValues.minOrNull() ?: 0.0)} MB")
            report.appendLine("  Max: ${String.format("%.2f", memValues.maxOrNull() ?: 0.0)} MB")
            report.appendLine()

            // GPU Statistics
            val gpuValues = snapshots.map { it.gpuUsagePercent }
            report.appendLine("GPU USAGE (Estimated):")
            report.appendLine("  Average: ${String.format("%.2f", gpuValues.average())}%")
            report.appendLine("  Min: ${String.format("%.2f", gpuValues.minOrNull() ?: 0.0)}%")
            report.appendLine("  Max: ${String.format("%.2f", gpuValues.maxOrNull() ?: 0.0)}%")
            report.appendLine("  Note: GPU metrics are approximate on Android without root access")
            report.appendLine()
        }

        // Recording Latency
        synchronized(recordingLatencies) {
            if (recordingLatencies.isNotEmpty()) {
                report.appendLine("RECORDING START LATENCY:")
                report.appendLine("  Average: ${recordingLatencies.average().toLong()} ms")
                report.appendLine("  Min: ${recordingLatencies.minOrNull() ?: 0} ms")
                report.appendLine("  Max: ${recordingLatencies.maxOrNull() ?: 0} ms")
                report.appendLine("  Samples: ${recordingLatencies.size}")
                report.appendLine()
            }
        }

        // Analysis & Recommendations
        report.appendLine("ANALYSIS & BOTTLENECKS:")
        synchronized(snapshots) {
            val avgCpu = snapshots.map { it.cpuUsagePercent }.average()
            val avgMem = snapshots.map { it.memoryUsageMB }.average()
            val avgGpu = snapshots.map { it.gpuUsagePercent }.average()

            if (avgCpu > 70) {
                report.appendLine("  ⚠ HIGH CPU USAGE detected (${String.format("%.1f", avgCpu)}%)")
                report.appendLine("    - Consider reducing video resolution or frame rate")
                report.appendLine("    - Use hardware acceleration when possible")
            }

            if (avgMem > 200) {
                report.appendLine(
                        "  ⚠ HIGH MEMORY USAGE detected (${String.format("%.1f", avgMem)} MB)"
                )
                report.appendLine("    - Reduce circular buffer size")
                report.appendLine("    - Optimize frame storage (use smaller buffer)")
            }

            if (avgGpu > 80) {
                report.appendLine("  ⚠ HIGH GPU LOAD detected (${String.format("%.1f", avgGpu)}%)")
                report.appendLine("    - Lower video quality/bitrate")
                report.appendLine("    - Reduce preview resolution")
            }

            if (avgCpu < 40 && avgMem < 150 && avgGpu < 50) {
                report.appendLine("  ✓ System resources are well-balanced")
            }
        }

        report.appendLine()
        report.appendLine("IMPROVEMENT RECOMMENDATIONS:")
        report.appendLine("  1. Use MediaCodec surface input for zero-copy encoding")
        report.appendLine("  2. Tune bitrate based on resolution (4-8 Mbps for 1080p)")
        report.appendLine("  3. Implement adaptive quality based on device capabilities")
        report.appendLine("  4. Consider using lower resolution (720p) for circular buffer")
        report.appendLine("  5. Profile frame allocation and minimize object creation")

        return report.toString()
    }

    fun getLatestSnapshot(): TelemetrySnapshot? {
        synchronized(snapshots) {
            return snapshots.lastOrNull()
        }
    }
}
