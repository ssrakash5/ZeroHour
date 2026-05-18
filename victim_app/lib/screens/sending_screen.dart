import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../services/api_service.dart';
import '../services/ble_sos_service.dart';
import '../services/gemma_service.dart';
import 'packet_summary_screen.dart';

const _cream = Color(0xFFF5F1EB);
const _relay = Color(0xFF00C9D4);
const _critical = Color(0xFFE84040);
const _gray900 = Color(0xFF111827);
const _gray500 = Color(0xFF6B7280);
const _gray400 = Color(0xFF9CA3AF);
const _gray200 = Color(0xFFE5E7EB);

class SendingScreen extends StatefulWidget {
  final Map<String, dynamic> report;
  const SendingScreen({super.key, required this.report});

  @override
  State<SendingScreen> createState() => _SendingScreenState();
}

class _SendingScreenState extends State<SendingScreen> {
  int _doneIdx = -1;
  int _activeIdx = 0;
  String? _error;
  Map<String, dynamic>? _deviceTriage;
  String _victimStatement = '';
  bool _bleMode = false;
  bool _bleAcked = false;
  bool _btDisabled = false;
  Map<String, dynamic>? _hubResult;
  StreamSubscription<String>? _ackSub;

  late List<_Step> _steps;

  String _shortField(String? value, int maxLength) {
    final text = value ?? '';
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength)}...';
  }

  @override
  void initState() {
    super.initState();
    final hasAudio = widget.report['has_audio'] == true;
    final hasImage = widget.report['has_image'] == true;
    final evidenceParts = [if (hasImage) 'photos', if (hasAudio) 'voice note'];
    final evidenceLabel = evidenceParts.isNotEmpty
        ? 'Attaching ${evidenceParts.join(' and ')}'
        : 'Attaching typed details';

    _steps = [
      _Step('Locking rescue coordinates', 650),
      _Step(evidenceLabel, 550),
      _Step('Checking nearby duplicate reports', 650),
      _Step('Gemma 4 E2B assessing on-device', 0, triage: true),
      _Step('Sending to central hub', 750, post: true),
      _Step('Waiting for responder acknowledgement', 650, waitAck: true),
    ];

    _runFlow();
  }

  Future<void> _runFlow() async {
    Map<String, dynamic>? result;

    for (int i = 0; i < _steps.length; i++) {
      if (!mounted) return;
      setState(() => _activeIdx = i);

      if (_steps[i].triage) {
        final msg = widget.report['message'] as String? ?? '';
        final hasAudio = widget.report['has_audio'] == true;
        final hasImage = widget.report['has_image'] == true;
        final audioB64 = widget.report['audio_base64'] as String?;
        final audioPath = widget.report['audio_path'] as String?;
        final imagePaths = (widget.report['image_paths'] as List?)?.cast<String>() ?? [];
        final recordingSeconds = (widget.report['recording_seconds'] as num?)?.toInt() ?? 0;

        print('─────────────────────────────────────────');
        print('[E2B INPUT] model ready: ${GemmaService.instance.isReady}');
        print('[E2B INPUT] text: $msg');
        print('[E2B INPUT] images: ${imagePaths.length}  audio: ${audioPath != null}  has_audio=$hasAudio');
        if (hasAudio && audioB64 != null) {
          print('[E2B INPUT] audio_base64 ${audioB64.length} chars → backend transcription');
        }
        print('─────────────────────────────────────────');

        if (GemmaService.instance.isReady && (msg.isNotEmpty || hasAudio || hasImage)) {
          _deviceTriage = await GemmaService.instance.triage(
            msg.isNotEmpty ? msg : 'Victim submitted emergency audio/photo evidence.',
            imagePaths: imagePaths.isNotEmpty ? imagePaths : null,
            audioPath: audioPath,
            audioDurationSeconds: recordingSeconds > 0 ? recordingSeconds : null,
          );
          print('[E2B OUTPUT] triage result: $_deviceTriage');
          if (_deviceTriage != null) {
            _victimStatement = (_deviceTriage!['victim_statement'] as String?) ?? '';
            // Fall back to the triage message if victim_statement is empty
            if (_victimStatement.isEmpty) {
              _victimStatement = (_deviceTriage!['message'] as String?) ?? '';
            }
            print('[E2B OUTPUT] emergency_type   : ${_deviceTriage!['emergency_type']}');
            print('[E2B OUTPUT] severity         : ${_deviceTriage!['severity']}');
            print('[E2B OUTPUT] people_count     : ${_deviceTriage!['people_count']}');
            print('[E2B OUTPUT] quick_needs      : ${_deviceTriage!['quick_needs']}');
            print('[E2B OUTPUT] message          : ${_deviceTriage!['message']}');
            print('[E2B OUTPUT] victim_statement : $_victimStatement');
          }
        } else {
          print('[E2B OUTPUT] skipped — model not ready or empty message');
        }
        print('─────────────────────────────────────────');
      } else if (_steps[i].post) {
        try {
          final r = widget.report;
          final audioB64 = r['audio_base64'] as String?;
          print('[HUB SEND] victim=${r['victim_code']} lat=${r['lat']} lng=${r['lng']}');
          print('[HUB SEND] has_audio=${r['has_audio']}  has_image=${r['has_image']}');
          print('[HUB SEND] audio_base64=${audioB64 != null ? '${audioB64.length} chars → backend 26B will transcribe' : 'none'}');
          print('[HUB SEND] device_triage=${_deviceTriage != null ? 'attached (backend will skip its own triage)' : 'null (backend will run its own triage)'}');
          result = await ApiService.instance.postSOS(
            victimCode: r['victim_code'] as String,
            lat: (r['lat'] as num).toDouble(),
            lng: (r['lng'] as num).toDouble(),
            message: r['message'] as String?,
            severity: r['severity'] as String?,
            emergencyType: r['emergency_type'] as String?,
            audioBase64: audioB64,
            hasAudio: r['has_audio'] == true,
            hasImage: r['has_image'] == true,
            hops: (r['hops'] as num?)?.toInt() ?? 0,
            deviceTriage: _deviceTriage,
          );
          _hubResult = result;
          print('[HUB SEND] success → ${result}');
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(kLastSosKey, jsonEncode(result));
        } catch (e) {
          final isOffline = e.toString().contains('SocketException') ||
              e.toString().contains('Connection refused') ||
              e.toString().contains('Network is unreachable') ||
              e is SocketException;
          if (isOffline) {
            if (mounted) setState(() {
              _bleMode = true;
              _steps[i + 1] = const _Step('Broadcasting SOS via Bluetooth relay', 0, ble: true);
            });
          } else {
            if (mounted) setState(() => _error = 'Hub unreachable: $e');
            return;
          }
        }
      } else if (_steps[i].ble) {
        final r = widget.report;
        final victimCode = r['victim_code'] as String;

        // Build compact SOS JSON for GATT — must stay under ~490 bytes (BLE MTU limit).
        // Exclude verbose raw message; hub reconstructs context from device_triage fields.
        final triageSummary = (_deviceTriage?['message'] as String?) ??
            (_victimStatement.isNotEmpty ? _victimStatement : (r['message'] as String? ?? ''));
        final sosData = {
          'victim_code': victimCode,
          'lat': r['lat'],
          'lng': r['lng'],
          'severity': (_deviceTriage?['severity'] as String?) ?? r['severity'] ?? 'urgent',
          'emergency_type': (_deviceTriage?['emergency_type'] as String?) ?? r['emergency_type'] ?? 'unknown',
          'message': triageSummary.length > 120 ? '${triageSummary.substring(0, 120)}…' : triageSummary,
          'has_audio': r['has_audio'] ?? false,
          'has_image': r['has_image'] ?? false,
          'hops': ((r['hops'] as num?)?.toInt() ?? 0) + 1,
          'people_count': _deviceTriage?['people_count'] ?? 1,
          'quick_needs': (_deviceTriage?['quick_needs'] as String? ?? '').length > 80
              ? (_deviceTriage!['quick_needs'] as String).substring(0, 80)
              : (_deviceTriage?['quick_needs'] ?? ''),
          if ((_deviceTriage?['original_transcript'] as String? ?? '').isNotEmpty)
            'original_transcript': _shortField(_deviceTriage?['original_transcript'] as String?, 90),
          if ((_deviceTriage?['english_transcript'] as String? ?? '').isNotEmpty)
            'english_transcript': _shortField(_deviceTriage?['english_transcript'] as String?, 120),
          if (_victimStatement.isNotEmpty) 'victim_statement':
              _victimStatement.length > 120 ? '${_victimStatement.substring(0, 120)}…' : _victimStatement,
        };

        // Subscribe to ACK scan before advertising so we don't miss a fast beacon
        _ackSub = BleSosService.instance.ackStream(victimCode).listen((code) {
          if (!mounted) return;
          setState(() => _bleAcked = true);
          _ackSub?.cancel();
          BleSosService.instance.stopScanning();
          BleSosService.instance.stopGattSos();
          // Navigate to packet summary after a short pause so user sees the ACK card
          Future.delayed(const Duration(seconds: 2), () {
            if (!mounted) return;
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => PacketSummaryScreen(
                report: widget.report,
                deviceTriage: _deviceTriage,
                victimStatement: _victimStatement,
                hubResult: null,
                transmissionMethod: 'relay',
                onReset: _goHome,
              )),
            );
          });
        });

        final bleResult = await BleSosService.instance.startGattSos(sosData);
        if (mounted) setState(() {
          _btDisabled = bleResult == BleStartResult.btDisabled;
        });
      } else if (_steps[i].waitAck && _bleMode) {
        // Skip wait-for-ack step in BLE mode — drone handles delivery
        await Future.delayed(Duration.zero);
        if (mounted) setState(() => _doneIdx = i);
        break;
      }

      await Future.delayed(Duration(milliseconds: _steps[i].ms));
      if (!mounted) return;
      setState(() => _doneIdx = i);
    }

    if (mounted && !_bleMode) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => PacketSummaryScreen(
          report: widget.report,
          deviceTriage: _deviceTriage,
          victimStatement: _victimStatement,
          hubResult: _hubResult,
          transmissionMethod: 'direct',
          onReset: _goHome,
        )),
      );
    }
    // In BLE mode we stay on this screen and keep broadcasting
  }

  Future<void> _retryBle() async {
    if (!mounted) return;
    setState(() => _btDisabled = false);
    final r = widget.report;
    final retrySummary = (_deviceTriage?['message'] as String?) ??
        (_victimStatement.isNotEmpty ? _victimStatement : (r['message'] as String? ?? ''));
    final sosData = {
      'victim_code': r['victim_code'],
      'lat': r['lat'],
      'lng': r['lng'],
      'severity': (_deviceTriage?['severity'] as String?) ?? r['severity'] ?? 'urgent',
      'emergency_type': (_deviceTriage?['emergency_type'] as String?) ?? r['emergency_type'] ?? 'unknown',
      'message': retrySummary.length > 120 ? '${retrySummary.substring(0, 120)}…' : retrySummary,
      'has_audio': r['has_audio'] ?? false,
      'has_image': r['has_image'] ?? false,
      'hops': ((r['hops'] as num?)?.toInt() ?? 0) + 1,
      'people_count': _deviceTriage?['people_count'] ?? 1,
      'quick_needs': (_deviceTriage?['quick_needs'] as String? ?? '').length > 80
          ? (_deviceTriage!['quick_needs'] as String).substring(0, 80)
          : (_deviceTriage?['quick_needs'] ?? ''),
      if ((_deviceTriage?['original_transcript'] as String? ?? '').isNotEmpty)
        'original_transcript': _shortField(_deviceTriage?['original_transcript'] as String?, 90),
      if ((_deviceTriage?['english_transcript'] as String? ?? '').isNotEmpty)
        'english_transcript': _shortField(_deviceTriage?['english_transcript'] as String?, 120),
      if (_victimStatement.isNotEmpty) 'victim_statement':
          _victimStatement.length > 120 ? '${_victimStatement.substring(0, 120)}…' : _victimStatement,
    };
    final bleResult = await BleSosService.instance.startGattSos(sosData);
    if (mounted) setState(() {
      _btDisabled = bleResult == BleStartResult.btDisabled;
    });
  }

  Future<void> _goHome() async {
    _ackSub?.cancel();
    BleSosService.instance.stopScanning();
    BleSosService.instance.stopGattSos();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(kLastSosKey);
    if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  void dispose() {
    _ackSub?.cancel();
    BleSosService.instance.stopScanning();
    BleSosService.instance.stopGattSos();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.report;
    final lat = (r['lat'] as num).toDouble();
    final lng = (r['lng'] as num).toDouble();
    final hasAudio = r['has_audio'] == true;
    final hasImage = r['has_image'] == true;
    final victimCode = r['victim_code'] as String? ?? '';

    return Scaffold(
      backgroundColor: _cream,
      body: SafeArea(
        child: Column(
          children: [
            // Top bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Row(children: [
                  Container(
                    width: 6, height: 6,
                    decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF60A5FA)),
                    child: const SizedBox(),
                  ),
                  const SizedBox(width: 6),
                  // pulsing dot via AnimatedOpacity would require animation controller, keep simple
                  const Text('sending', style: TextStyle(color: _gray500, fontSize: 12)),
                ]),
                Text(victimCode, style: const TextStyle(color: _gray400, fontSize: 12, fontFamily: 'monospace')),
              ]),
            ),

            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    const Text('RESCUE PACKET', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 3, fontFamily: 'monospace')),
                    const SizedBox(height: 4),
                    const Text('Stay on this screen.', style: TextStyle(color: _gray900, fontSize: 28, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    const Text('Your request is being deduplicated, triaged, and routed.',
                        style: TextStyle(color: _gray500, fontSize: 13, height: 1.5)),
                    const SizedBox(height: 20),

                    // Location summary card
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.75),
                        border: Border.all(color: _gray200),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(children: [
                        const Icon(Icons.location_on_outlined, color: _relay, size: 18),
                        const SizedBox(width: 10),
                        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('AI assessing incident type and criticality',
                              style: TextStyle(color: _gray900, fontSize: 12, fontWeight: FontWeight.w700)),
                          Text('${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}',
                              style: const TextStyle(color: _gray400, fontSize: 11, fontFamily: 'monospace')),
                          Text(
                            '${hasImage ? 'Photos attached' : 'No photos'} · ${hasAudio ? 'Voice note attached' : 'No voice note'}',
                            style: const TextStyle(color: _gray500, fontSize: 11),
                          ),
                        ]),
                      ]),
                    ),
                    const SizedBox(height: 16),

                    // Steps
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: _gray200),
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
                      ),
                      child: Column(
                        children: List.generate(_steps.length, (i) {
                          final isDone = i <= _doneIdx;
                          final isActive = i == _activeIdx && !isDone;
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 7),
                            child: Row(children: [
                              if (isDone)
                                const Icon(Icons.check_circle, color: Color(0xFF22C55E), size: 20)
                              else if (isActive)
                                const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Color(0xFF60A5FA)))
                              else
                                const Icon(Icons.circle_outlined, color: _gray200, size: 20),
                              const SizedBox(width: 12),
                              Expanded(child: Text(
                                _steps[i].label,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: isDone ? const Color(0xFF374151) : isActive ? _gray900 : _gray200,
                                  fontWeight: isDone || isActive ? FontWeight.w500 : FontWeight.normal,
                                ),
                              )),
                            ]),
                          );
                        }),
                      ),
                    ),

                    const SizedBox(height: 24),

                    if (_error != null)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          border: Border.all(color: const Color(0xFFFECACA)),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(_error!, style: const TextStyle(color: _critical, fontSize: 12, fontWeight: FontWeight.w600),
                            textAlign: TextAlign.center),
                      )
                    else if (_btDisabled)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFFBEB),
                          border: Border.all(color: const Color(0xFFFCD34D)),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Row(children: [
                            Icon(Icons.bluetooth_disabled, color: Color(0xFFD97706), size: 16),
                            SizedBox(width: 8),
                            Text('BLUETOOTH IS OFF',
                                style: TextStyle(color: Color(0xFFB45309), fontSize: 10, letterSpacing: 2, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                          ]),
                          const SizedBox(height: 8),
                          const Text('No internet and Bluetooth is disabled. Enable Bluetooth so your SOS can reach a relay drone.',
                              style: TextStyle(color: Color(0xFF78350F), fontSize: 12, height: 1.5)),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _retryBle,
                              icon: const Icon(Icons.bluetooth, size: 14),
                              label: const Text('Bluetooth enabled — retry', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFD97706),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                elevation: 0,
                              ),
                            ),
                          ),
                        ]),
                      )
                    else if (_bleMode)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          border: Border.all(color: const Color(0xFF93C5FD)),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Container(
                              width: 8, height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _bleAcked ? const Color(0xFF22C55E) : const Color(0xFF3B82F6),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _bleAcked ? 'RELAY ACKNOWLEDGED' : 'BLUETOOTH RELAY ACTIVE',
                              style: TextStyle(
                                color: _bleAcked ? const Color(0xFF15803D) : const Color(0xFF1D4ED8),
                                fontSize: 10, letterSpacing: 2, fontFamily: 'monospace', fontWeight: FontWeight.w700,
                              ),
                            ),
                          ]),
                          const SizedBox(height: 8),
                          if (_bleAcked) ...[
                            const Text(
                              'Your SOS was picked up by a relay drone and is being forwarded to the hub.',
                              style: TextStyle(color: Color(0xFF14532D), fontSize: 12, height: 1.5, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Responders have been notified. Stay where you are if it is safe.',
                              style: TextStyle(color: Color(0xFF15803D), fontSize: 11, height: 1.5),
                            ),
                          ] else ...[
                            const Text('No internet detected. Broadcasting SOS packet via Bluetooth.',
                                style: TextStyle(color: Color(0xFF1E3A5F), fontSize: 12, height: 1.5)),
                            const SizedBox(height: 4),
                            const Text('A nearby relay drone will pick up your signal and forward it to the hub.',
                                style: TextStyle(color: Color(0xFF3B82F6), fontSize: 11, height: 1.5)),
                          ],
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: TextButton(
                              onPressed: _goHome,
                              style: TextButton.styleFrom(
                                backgroundColor: const Color(0xFF1D4ED8),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              child: const Text('Stop broadcasting & go back', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            ),
                          ),
                        ]),
                      )
                    else
                      const Center(
                        child: Text('Keep the phone nearby if safe.',
                            style: TextStyle(color: _gray500, fontSize: 13, fontFamily: 'monospace')),
                      ),
                  ],
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: const Text('central hub + responder routing',
                  style: TextStyle(color: _gray400, fontSize: 11, fontFamily: 'monospace'),
                  textAlign: TextAlign.center),
            ),
          ],
        ),
      ),
    );
  }
}

class _Step {
  final String label;
  final int ms;
  final bool post;
  final bool triage;
  final bool ble;
  final bool waitAck;
  const _Step(this.label, this.ms, {this.post = false, this.triage = false, this.ble = false, this.waitAck = false});
}
