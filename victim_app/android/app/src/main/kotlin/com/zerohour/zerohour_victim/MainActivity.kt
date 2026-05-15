package com.zerohour.zerohour_victim

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.os.ParcelUuid
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class MainActivity : FlutterActivity() {
    private val channel = "com.zerohour/gemma"
    private val bleChannel = "com.zerohour/ble"
    private val bleScanChannel = "com.zerohour/ble_scan"

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var engine: Engine? = null

    // BLE advertise
    private var bleAdvertiser: BluetoothLeAdvertiser? = null
    private var bleCallback: AdvertiseCallback? = null

    // BLE scan (ACK detection)
    private var bleScanner: BluetoothLeScanner? = null
    private var bleScanCallback: ScanCallback? = null
    private var ackEventSink: EventChannel.EventSink? = null

    // GATT server
    private var gattServer: BluetoothGattServer? = null
    private var sosJsonBytes: ByteArray = ByteArray(0)

    companion object {
        val SOS_SERVICE_UUID: UUID  = UUID.fromString("5a480001-0000-1000-8000-00805f9b34fb")
        val SOS_DATA_CHAR_UUID: UUID = UUID.fromString("5a480002-0000-1000-8000-00805f9b34fb")
        val SOS_ACK_CHAR_UUID: UUID  = UUID.fromString("5a480003-0000-1000-8000-00805f9b34fb")
    }

    private fun resolveModelPath(modelPath: String): String {
        val src = File(modelPath)
        val dest = File(filesDir, src.name)
        if (dest.exists() && dest.length() == src.length()) return dest.absolutePath
        if (!src.exists()) throw Exception("Source not found: $modelPath")
        src.copyTo(dest, overwrite = true)
        return dest.absolutePath
    }

    /** Returns the BT adapter if enabled, otherwise fires the system enable dialog and errors the result. */
    private fun requireBluetoothEnabled(result: MethodChannel.Result): BluetoothAdapter? {
        val btManager = getSystemService(BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = btManager.adapter
        if (adapter == null) {
            result.error("BT_NOT_SUPPORTED", "Device has no Bluetooth", null)
            return null
        }
        if (!adapter.isEnabled) {
            @Suppress("DEPRECATION")
            startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            result.error("BT_DISABLED", "Bluetooth is off — enable dialog shown", null)
            return null
        }
        return adapter
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // ── Gemma / E2B channel ──────────────────────────────────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "initialize" -> {
                        val modelPath = call.argument<String>("modelPath")
                        if (modelPath == null) { result.error("ARGS", "modelPath required", null); return@setMethodCallHandler }
                        scope.launch {
                            try {
                                val internalPath = resolveModelPath(modelPath)
                                val e = Engine(EngineConfig(
                                    modelPath = internalPath,
                                    visionBackend = Backend.CPU(),
                                    audioBackend = Backend.CPU(),
                                ))
                                e.initialize()
                                engine = e
                                withContext(Dispatchers.Main) { result.success(true) }
                            } catch (e: Exception) {
                                withContext(Dispatchers.Main) { result.error("INIT_FAILED", e.message, null) }
                            }
                        }
                    }
                    "triage" -> {
                        val prompt = call.argument<String>("prompt")
                        val imagePaths = call.argument<List<String>>("imagePaths") ?: emptyList()
                        val audioPath = call.argument<String>("audioPath")
                        val e = engine
                        if (prompt == null) { result.error("ARGS", "prompt required", null); return@setMethodCallHandler }
                        if (e == null) { result.error("NOT_READY", "Model not initialized", null); return@setMethodCallHandler }
                        scope.launch {
                            try {
                                val parts = mutableListOf<Content>()
                                for (path in imagePaths) {
                                    if (File(path).exists()) parts.add(Content.ImageFile(path))
                                }
                                if (audioPath != null && File(audioPath).exists()) {
                                    parts.add(Content.AudioFile(audioPath))
                                }
                                parts.add(Content.Text(prompt))

                                val response = e.createConversation().use { conv ->
                                    if (parts.size == 1) conv.sendMessage(prompt)
                                    else conv.sendMessage(Contents.of(*parts.toTypedArray()))
                                }
                                withContext(Dispatchers.Main) { result.success(response.toString()) }
                            } catch (ex: Exception) {
                                withContext(Dispatchers.Main) { result.error("TRIAGE_FAILED", ex.message, null) }
                            }
                        }
                    }
                    else -> result.notImplemented()
                }
            }

        // ── BLE channel ──────────────────────────────────────────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, bleChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {

                    // ── GATT SOS server ──────────────────────────────────────
                    "startGattSos" -> {
                        val sosJson = call.argument<String>("sosJson") ?: ""
                        startGattSos(sosJson, result)
                    }
                    "stopGattSos" -> {
                        stopGattSos()
                        result.success(true)
                    }

                    // ── Legacy non-connectable advertise (ACK beacon / fallback) ──
                    "startAdvertising" -> {
                        val payload = call.argument<ByteArray>("payload")
                        if (payload == null) { result.error("ARGS", "payload required", null); return@setMethodCallHandler }
                        try {
                            val adapter = requireBluetoothEnabled(result) ?: return@setMethodCallHandler
                            val adv = adapter.bluetoothLeAdvertiser
                                ?: throw Exception("BLE advertising not supported on this device")
                            val settings = AdvertiseSettings.Builder()
                                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                                .setConnectable(false)
                                .setTimeout(0).build()
                            val data = AdvertiseData.Builder()
                                .addManufacturerData(0x5A48, payload)
                                .setIncludeDeviceName(false).build()
                            val cb = object : AdvertiseCallback() {
                                override fun onStartSuccess(s: AdvertiseSettings) = println("[BLE] Advertising started")
                                override fun onStartFailure(e: Int) = println("[BLE] Advertising failed: $e")
                            }
                            adv.startAdvertising(settings, data, cb)
                            bleAdvertiser = adv; bleCallback = cb
                            result.success(true)
                        } catch (e: Exception) { result.error("BLE_FAILED", e.message, null) }
                    }
                    "stopAdvertising" -> {
                        bleCallback?.let { bleAdvertiser?.stopAdvertising(it) }
                        bleCallback = null
                        result.success(true)
                    }

                    // ── ACK scan ─────────────────────────────────────────────
                    "startScanning" -> {
                        val victimCode = call.argument<String>("victimCode") ?: ""
                        startBleScan(victimCode, result)
                    }
                    "stopScanning" -> { stopBleScan(); result.success(true) }

                    else -> result.notImplemented()
                }
            }

        // ── ACK event channel ────────────────────────────────────────────────
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, bleScanChannel)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) { ackEventSink = events }
                override fun onCancel(arguments: Any?) { ackEventSink = null }
            })
    }

    // ── GATT server ──────────────────────────────────────────────────────────

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            println("[GATT] device=${device.address} state=${if (newState == BluetoothProfile.STATE_CONNECTED) "connected" else "disconnected"}")
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice, requestId: Int, offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (characteristic.uuid != SOS_DATA_CHAR_UUID) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
                return
            }
            val data = sosJsonBytes
            val chunk = if (offset < data.size) data.copyOfRange(offset, data.size) else ByteArray(0)
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, chunk)
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice, requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean, responseNeeded: Boolean,
            offset: Int, value: ByteArray
        ) {
            if (characteristic.uuid == SOS_ACK_CHAR_UUID) {
                val code = String(value, Charsets.US_ASCII).trim()
                println("[GATT] ACK written by drone for $code")
                runOnUiThread { ackEventSink?.success(code) }
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }
    }

    private fun startGattSos(sosJson: String, result: MethodChannel.Result) {
        val adapter = requireBluetoothEnabled(result) ?: return
        sosJsonBytes = sosJson.toByteArray(Charsets.UTF_8)

        // Open GATT server
        val btManager = getSystemService(BLUETOOTH_SERVICE) as BluetoothManager
        val server = btManager.openGattServer(this, gattServerCallback)
            ?: run { result.error("GATT_FAILED", "Cannot open GATT server", null); return }

        val service = BluetoothGattService(SOS_SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        val dataChar = BluetoothGattCharacteristic(
            SOS_DATA_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        val ackChar = BluetoothGattCharacteristic(
            SOS_ACK_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        service.addCharacteristic(dataChar)
        service.addCharacteristic(ackChar)
        server.addService(service)
        gattServer = server

        // Start connectable advertising with service UUID so drone can filter
        val adv = adapter.bluetoothLeAdvertiser
            ?: run { result.error("BLE_FAILED", "No LE advertiser", null); return }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0).build()

        val data = AdvertiseData.Builder()
            .addManufacturerData(0x5A48, byteArrayOf(0x01)) // 0x01 = GATT SOS marker
            .addServiceUuid(ParcelUuid(SOS_SERVICE_UUID))
            .setIncludeDeviceName(false).build()

        val cb = object : AdvertiseCallback() {
            override fun onStartSuccess(s: AdvertiseSettings) = println("[GATT] Connectable advertising started")
            override fun onStartFailure(e: Int) = println("[GATT] Advertising failed: $e")
        }
        adv.startAdvertising(settings, data, cb)
        bleAdvertiser = adv; bleCallback = cb

        println("[GATT] Server started — SOS payload ${sosJsonBytes.size} bytes")
        result.success(true)
    }

    private fun stopGattSos() {
        bleCallback?.let { bleAdvertiser?.stopAdvertising(it) }
        bleCallback = null
        gattServer?.close()
        gattServer = null
        sosJsonBytes = ByteArray(0)
        println("[GATT] Server stopped")
    }

    // ── BLE scan (ACK detection) ──────────────────────────────────────────────

    private fun startBleScan(victimCode: String, result: MethodChannel.Result) {
        try {
            val adapter = requireBluetoothEnabled(result) ?: return
            val scanner = adapter.bluetoothLeScanner
                ?: throw Exception("BLE scanner not supported on this device")
            val expectedCode = victimCode.padEnd(6).take(6)
            val scanCallback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, scanResult: ScanResult) {
                    val mfrData = scanResult.scanRecord?.getManufacturerSpecificData(0x5A48) ?: return
                    if (mfrData.size != 7) return
                    if (mfrData[6] != 0xFF.toByte()) return
                    val code = String(mfrData.slice(0..5).toByteArray(), Charsets.US_ASCII).trim()
                    if (code != expectedCode.trim()) return
                    println("[BLE] ACK received for $code")
                    runOnUiThread { ackEventSink?.success(code) }
                }
            }
            scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback)
            bleScanner = scanner; bleScanCallback = scanCallback
            result.success(true)
        } catch (e: Exception) { result.error("BLE_SCAN_FAILED", e.message, null) }
    }

    private fun stopBleScan() {
        bleScanCallback?.let { bleScanner?.stopScan(it) }
        bleScanCallback = null
    }

    override fun onDestroy() {
        scope.cancel()
        engine?.close()
        stopGattSos()
        stopBleScan()
        super.onDestroy()
    }
}
