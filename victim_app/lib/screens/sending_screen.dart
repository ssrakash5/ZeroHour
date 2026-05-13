import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'acknowledged_screen.dart';

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

  late final List<_Step> _steps;

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
      _Step('Sending to central hub', 750, post: true),
      _Step('Gemma 4 reviewing voice, images, and details', 900),
      _Step('Waiting for responder acknowledgement', 650),
    ];

    _runFlow();
  }

  Future<void> _runFlow() async {
    Map<String, dynamic>? result;

    for (int i = 0; i < _steps.length; i++) {
      if (!mounted) return;
      setState(() => _activeIdx = i);

      if (_steps[i].post) {
        try {
          final r = widget.report;
          result = await ApiService.instance.postSOS(
            victimCode: r['victim_code'] as String,
            lat: (r['lat'] as num).toDouble(),
            lng: (r['lng'] as num).toDouble(),
            message: r['message'] as String?,
            severity: r['severity'] as String?,
            emergencyType: r['emergency_type'] as String?,
            audioBase64: r['audio_base64'] as String?,
            hasAudio: r['has_audio'] == true,
            hasImage: r['has_image'] == true,
            hops: (r['hops'] as num?)?.toInt() ?? 0,
          );
        } catch (_) {
          if (mounted) setState(() => _error = 'Hub unreachable. Keep this screen open and try again.');
          return;
        }
      }

      await Future.delayed(Duration(milliseconds: _steps[i].ms));
      if (!mounted) return;
      setState(() => _doneIdx = i);
    }

    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => AcknowledgedScreen(result: result ?? {}, onReset: _goHome)),
      );
    }
  }

  void _goHome() {
    Navigator.of(context).popUntil((route) => route.isFirst);
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
  const _Step(this.label, this.ms, {this.post = false});
}
