import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

enum BleStartResult { started, btDisabled, failed }

// Manufacturer ID 0x5A48 ('Z','H') — ZeroHour
// SOS packet layout (17 bytes):
//   [0-5]  victim code ASCII, space-padded
//   [6-9]  lat float32 little-endian
//   [10-13] lng float32 little-endian
//   [14]   severity: 0=low 1=urgent 2=critical
//   [15]   emergency_type: 0=medical 1=fire 2=flood 3=structural 4=violence 5=unknown 6=trapped
//   [16]   hops
//
// ACK beacon layout (7 bytes) — broadcast by drone after relay:
//   [0-5]  victim code ASCII, space-padded
//   [6]    0xFF (ACK flag — distinguishes from SOS packet by length + flag)
class BleSosService {
  BleSosService._();
  static final BleSosService instance = BleSosService._();

  static const _channel = MethodChannel('com.zerohour/ble');
  static const _scanChannel = EventChannel('com.zerohour/ble_scan');

  bool _advertising = false;
  bool get isAdvertising => _advertising;

  static const _sevMap = {'low': 0, 'urgent': 1, 'critical': 2};
  static const _typeMap = {
    'medical': 0, 'fire': 1, 'flood': 2,
    'structural': 3, 'violence': 4, 'unknown': 5, 'trapped': 6,
  };

  Uint8List buildPayload({
    required String victimCode,
    required double lat,
    required double lng,
    required String severity,
    required String emergencyType,
    required int hops,
  }) {
    final buf = ByteData(17);
    final code = victimCode.padRight(6).substring(0, 6);
    for (int i = 0; i < 6; i++) buf.setUint8(i, code.codeUnitAt(i));
    buf.setFloat32(6, lat, Endian.little);
    buf.setFloat32(10, lng, Endian.little);
    buf.setUint8(14, _sevMap[severity] ?? 1);
    buf.setUint8(15, _typeMap[emergencyType] ?? 5);
    buf.setUint8(16, hops.clamp(0, 255));
    return buf.buffer.asUint8List();
  }

  /// Returns `BleStartResult.started`, `.btDisabled`, or `.failed`.
  Future<BleStartResult> startAdvertising(Uint8List payload) async {
    final status = await Permission.bluetoothAdvertise.status;
    if (!status.isGranted) {
      final result = await Permission.bluetoothAdvertise.request();
      if (!result.isGranted) {
        print('[BLE] BLUETOOTH_ADVERTISE permission denied: $result');
        return BleStartResult.failed;
      }
    }
    try {
      final ok = await _channel.invokeMethod<bool>(
        'startAdvertising', {'payload': payload},
      );
      _advertising = ok == true;
      print('[BLE] advertising: $_advertising');
      return _advertising ? BleStartResult.started : BleStartResult.failed;
    } on PlatformException catch (e) {
      print('[BLE] startAdvertising error: $e');
      if (e.code == 'BT_DISABLED') return BleStartResult.btDisabled;
      return BleStartResult.failed;
    }
  }

  Future<void> stopAdvertising() async {
    try {
      await _channel.invokeMethod('stopAdvertising');
      _advertising = false;
    } on PlatformException {
      _advertising = false;
    }
  }

  /// Starts a GATT server exposing the full SOS JSON, then begins connectable
  /// advertising so the drone can connect and read it.
  Future<BleStartResult> startGattSos(Map<String, dynamic> sosData) async {
    final status = await Permission.bluetoothAdvertise.status;
    if (!status.isGranted) {
      final r = await Permission.bluetoothAdvertise.request();
      if (!r.isGranted) return BleStartResult.failed;
    }
    try {
      final sosJson = jsonEncode(sosData);
      final ok = await _channel.invokeMethod<bool>('startGattSos', {'sosJson': sosJson});
      _advertising = ok == true;
      return _advertising ? BleStartResult.started : BleStartResult.failed;
    } on PlatformException catch (e) {
      if (e.code == 'BT_DISABLED') return BleStartResult.btDisabled;
      return BleStartResult.failed;
    }
  }

  Future<void> stopGattSos() async {
    try {
      await _channel.invokeMethod('stopGattSos');
      _advertising = false;
    } on PlatformException catch (e) {
      print('[BLE] stopGattSos error: $e');
    }
  }

  /// Starts BLE scanning and returns a stream that emits once when the drone's
  /// ACK beacon is detected for [victimCode]. Subscribe before advertising.
  Stream<String> ackStream(String victimCode) {
    _channel.invokeMethod('startScanning', {'victimCode': victimCode})
        .catchError((e) => print('[BLE] startScanning error: $e'));
    return _scanChannel
        .receiveBroadcastStream()
        .map((event) => event as String);
  }

  Future<void> stopScanning() async {
    try {
      await _channel.invokeMethod('stopScanning');
    } on PlatformException catch (e) {
      print('[BLE] stopScanning error: $e');
    }
  }
}
