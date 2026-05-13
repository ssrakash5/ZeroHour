import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../services/gemma_service.dart';
import '../services/location_service.dart';
import '../config.dart';
import 'status_screen.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key});

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> with SingleTickerProviderStateMixin {
  final _recorder = AudioRecorder();
  final _textController = TextEditingController();

  String _victimCode = '';
  Position? _position;
  bool _isRecording = false;
  bool _isSending = false;
  bool _gemmaReady = false;
  String? _recordingPath;
  String _statusText = 'Hold the SOS button to send emergency alert';

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(vsync: this, duration: const Duration(seconds: 1))
      ..repeat(reverse: true);
    _pulseAnimation = Tween(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _init();
  }

  Future<void> _init() async {
    await _loadVictimCode();
    await _requestPermissions();
    _startLocationWatch();
    _loadGemma();
  }

  Future<void> _loadVictimCode() async {
    final prefs = await SharedPreferences.getInstance();
    String? code = prefs.getString(kVictimCodeKey);
    if (code == null) {
      final rand = Random();
      code = 'V-${String.fromCharCodes(List.generate(4, (_) => rand.nextInt(26) + 65))}';
      await prefs.setString(kVictimCodeKey, code);
    }
    if (mounted) setState(() => _victimCode = code!);
  }

  Future<void> _requestPermissions() async {
    await [Permission.location, Permission.microphone].request();
  }

  void _startLocationWatch() {
    LocationService.instance.positionStream().listen((pos) {
      if (mounted) setState(() => _position = pos);
    });
    LocationService.instance.getCurrentPosition().then((pos) {
      if (mounted && pos != null) setState(() => _position = pos);
    });
  }

  Future<void> _loadGemma() async {
    final ready = await GemmaService.instance.initialize();
    if (mounted) {
      setState(() => _gemmaReady = ready);
    }
  }

  Future<void> _toggleRecording() async {
    if (_isRecording) {
      final path = await _recorder.stop();
      setState(() {
        _isRecording = false;
        _recordingPath = path;
        _statusText = 'Voice captured. Press SOS to send.';
      });
    } else {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/sos_audio.aac';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
      setState(() {
        _isRecording = true;
        _statusText = 'Recording… tap mic again to stop.';
      });
    }
  }

  Future<void> _sendSOS() async {
    if (_isSending) return;
    if (_position == null) {
      setState(() => _statusText = 'Waiting for GPS location…');
      _position = await LocationService.instance.getCurrentPosition();
      if (_position == null) {
        setState(() => _statusText = 'Could not get location. Enable GPS and retry.');
        return;
      }
    }

    HapticFeedback.heavyImpact();
    setState(() {
      _isSending = true;
      _statusText = _gemmaReady ? 'Analyzing with Gemma (on-device)…' : 'Sending SOS…';
    });

    String? audioBase64;
    if (_recordingPath != null) {
      final bytes = await File(_recordingPath!).readAsBytes();
      audioBase64 = base64Encode(bytes);
    }

    final rawMessage = _textController.text.trim().isNotEmpty
        ? _textController.text.trim()
        : (_recordingPath != null ? '[voice recording]' : 'Emergency — help needed');

    // On-device Gemma triage (LiteRT)
    Map<String, dynamic>? triageResult;
    if (_gemmaReady) {
      triageResult = await GemmaService.instance.triage(rawMessage);
    }

    try {
      final result = await ApiService.instance.postSOS(
        victimCode: _victimCode,
        lat: _position!.latitude,
        lng: _position!.longitude,
        message: triageResult?['message'] as String? ?? rawMessage,
        severity: triageResult?['severity'] as String?,
        emergencyType: triageResult?['emergency_type'] as String?,
        audioBase64: audioBase64,
        hasAudio: audioBase64 != null,
      );

      if (mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => StatusScreen(response: result)),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSending = false;
          _statusText = 'Failed to send. Check connection and retry.';
        });
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _recorder.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080808),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const SizedBox(height: 24),

              // Header row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('YOUR ID', style: TextStyle(color: Color(0xFF6B7280), fontSize: 10, letterSpacing: 2)),
                      Text(_victimCode, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, fontFamily: 'monospace')),
                    ],
                  ),
                  _GemmaChip(ready: _gemmaReady),
                ],
              ),

              const SizedBox(height: 16),

              // GPS status
              _GpsBar(position: _position),

              const Spacer(),

              // Text input
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF111827),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF1F2937)),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: TextField(
                  controller: _textController,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  maxLines: 3,
                  minLines: 1,
                  decoration: const InputDecoration(
                    hintText: 'Describe emergency (optional)…',
                    hintStyle: TextStyle(color: Color(0xFF6B7280)),
                    border: InputBorder.none,
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // Mic button
              GestureDetector(
                onTap: _isSending ? null : _toggleRecording,
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: _isRecording ? const Color(0xFFE84040) : const Color(0xFF1F2937),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF374151)),
                  ),
                  child: Icon(
                    _isRecording ? Icons.stop : Icons.mic,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // SOS button
              ScaleTransition(
                scale: _pulseAnimation,
                child: GestureDetector(
                  onTap: _isSending ? null : _sendSOS,
                  child: Container(
                    width: 200,
                    height: 200,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _isSending ? const Color(0xFF7F1D1D) : const Color(0xFFE84040),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFE84040).withOpacity(0.4),
                          blurRadius: 48,
                          spreadRadius: 8,
                        ),
                      ],
                    ),
                    child: Center(
                      child: _isSending
                          ? const CircularProgressIndicator(color: Colors.white, strokeWidth: 3)
                          : const Text(
                              'SOS',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 48,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 4,
                              ),
                            ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 28),

              Text(
                _statusText,
                style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12),
                textAlign: TextAlign.center,
              ),

              const Spacer(),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _GemmaChip extends StatelessWidget {
  final bool ready;
  const _GemmaChip({required this.ready});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: ready ? const Color(0xFF00C9D4).withOpacity(0.1) : const Color(0xFF1F2937),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: ready ? const Color(0xFF00C9D4).withOpacity(0.4) : const Color(0xFF374151),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: ready ? const Color(0xFF00C9D4) : const Color(0xFF6B7280),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            ready ? 'Gemma 4 · LiteRT' : 'Gemma offline',
            style: TextStyle(
              color: ready ? const Color(0xFF00C9D4) : const Color(0xFF6B7280),
              fontSize: 10,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }
}

class _GpsBar extends StatelessWidget {
  final Position? position;
  const _GpsBar({required this.position});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF1F2937)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.location_on,
            size: 14,
            color: position != null ? const Color(0xFF22C55E) : const Color(0xFF6B7280),
          ),
          const SizedBox(width: 8),
          Text(
            position != null
                ? '${position!.latitude.toStringAsFixed(5)}, ${position!.longitude.toStringAsFixed(5)}'
                : 'Acquiring GPS…',
            style: TextStyle(
              color: position != null ? Colors.white : const Color(0xFF6B7280),
              fontSize: 12,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }
}
