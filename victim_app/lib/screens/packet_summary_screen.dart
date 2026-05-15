import 'package:flutter/material.dart';

const _cream = Color(0xFFF5F1EB);
const _relay = Color(0xFF00C9D4);
const _critical = Color(0xFFE84040);
const _gray900 = Color(0xFF111827);
const _gray700 = Color(0xFF374151);
const _gray500 = Color(0xFF6B7280);
const _gray400 = Color(0xFF9CA3AF);
const _gray200 = Color(0xFFE5E7EB);

class PacketSummaryScreen extends StatelessWidget {
  final Map<String, dynamic> report;
  final Map<String, dynamic>? deviceTriage;
  final String victimStatement;
  final Map<String, dynamic>? hubResult;
  final String transmissionMethod; // 'direct' | 'relay'
  final VoidCallback onReset;

  const PacketSummaryScreen({
    super.key,
    required this.report,
    required this.deviceTriage,
    this.victimStatement = '',
    required this.hubResult,
    required this.transmissionMethod,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    final victimCode = report['victim_code'] as String? ?? '';
    final lat = (report['lat'] as num?)?.toDouble() ?? 0;
    final lng = (report['lng'] as num?)?.toDouble() ?? 0;
    final hasAudio = report['has_audio'] == true;
    final hasImage = report['has_image'] == true;
    final recordingSecs = (report['recording_seconds'] as num?)?.toInt() ?? 0;
    final imageCount = hasImage ? ((report['image_paths'] as List?)?.length ?? 1) : 0;

    final emergencyType = (deviceTriage?['emergency_type'] as String?) ??
        (report['emergency_type'] as String?) ?? 'unknown';
    final severity = (deviceTriage?['severity'] as String?) ?? 'unknown';
    final peopleCount = deviceTriage?['people_count'];
    final quickNeeds = deviceTriage?['quick_needs'] as String? ?? '';
    final triageMessage = deviceTriage?['message'] as String? ?? '';
    final imageAnalysis = deviceTriage?['image_analysis'] as String? ?? '';

    final responderName = hubResult?['assignment']?['responder_name'] as String?;
    final eta = hubResult?['assignment']?['eta_minutes'];

    final isRelay = transmissionMethod == 'relay';

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
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFF22C55E),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isRelay ? 'relayed via drone' : 'sent directly',
                    style: const TextStyle(color: _gray500, fontSize: 12),
                  ),
                ]),
                Text(victimCode,
                    style: const TextStyle(color: _gray400, fontSize: 12, fontFamily: 'monospace')),
              ]),
            ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    const Text('PACKET RECEIPT',
                        style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 3, fontFamily: 'monospace')),
                    const SizedBox(height: 4),
                    const Text('What was sent.', style: TextStyle(
                        color: _gray900, fontSize: 28, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    Text(
                      isRelay
                          ? 'Your SOS was processed on-device and relayed through a drone to the hub.'
                          : 'Your SOS was processed on-device and sent directly to the hub.',
                      style: const TextStyle(color: _gray500, fontSize: 13, height: 1.5),
                    ),
                    const SizedBox(height: 20),

                    // Responder card (only if direct path with assignment)
                    if (!isRelay && responderName != null) ...[
                      _sectionCard(
                        color: const Color(0xFFF0FDF4),
                        borderColor: const Color(0xFF86EFAC),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Row(children: [
                            Icon(Icons.shield_outlined, color: Color(0xFF16A34A), size: 16),
                            SizedBox(width: 8),
                            Text('RESPONDER ASSIGNED',
                                style: TextStyle(color: Color(0xFF15803D), fontSize: 10,
                                    letterSpacing: 2, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                          ]),
                          const SizedBox(height: 8),
                          Text(responderName, style: const TextStyle(
                              color: Color(0xFF14532D), fontSize: 15, fontWeight: FontWeight.w800)),
                          if (eta != null) ...[
                            const SizedBox(height: 4),
                            Text('ETA: $eta minutes',
                                style: const TextStyle(color: Color(0xFF16A34A), fontSize: 13)),
                          ],
                        ]),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Relay acknowledged card
                    if (isRelay) ...[
                      _sectionCard(
                        color: const Color(0xFFEFF6FF),
                        borderColor: const Color(0xFF93C5FD),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Row(children: [
                            Icon(Icons.bluetooth, color: Color(0xFF1D4ED8), size: 16),
                            SizedBox(width: 8),
                            Text('RELAY ACKNOWLEDGED',
                                style: TextStyle(color: Color(0xFF1D4ED8), fontSize: 10,
                                    letterSpacing: 2, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                          ]),
                          const SizedBox(height: 8),
                          const Text(
                            'A drone picked up your SOS over Bluetooth and forwarded it to the hub.',
                            style: TextStyle(color: Color(0xFF1E3A5F), fontSize: 12, height: 1.5),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // E2B triage results
                    _header('GEMMA 4 E2B — ON-DEVICE ASSESSMENT'),
                    const SizedBox(height: 8),
                    _sectionCard(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (deviceTriage == null)
                          const Text('E2B model was not available — hub performed triage.',
                              style: TextStyle(color: _gray500, fontSize: 12))
                        else ...[
                          _triageRow('Type', _capitalize(emergencyType), _typeColor(emergencyType)),
                          const SizedBox(height: 8),
                          _triageRow('Severity', _capitalize(severity), _severityColor(severity)),
                          if (peopleCount != null) ...[
                            const SizedBox(height: 8),
                            _triageRow('People', '$peopleCount', _gray700),
                          ],
                          if (quickNeeds.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            _labeledText('Quick needs', quickNeeds),
                          ],
                          if (triageMessage.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            _labeledText('Summary', triageMessage),
                          ],
                        ],
                      ]),
                    ),
                    const SizedBox(height: 16),

                    // What Gemma understood — shown only if a statement was produced
                    if (victimStatement.isNotEmpty) ...[
                      _header('WHAT YOU REPORTED'),
                      const SizedBox(height: 8),
                      _sectionCard(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: const [
                            Icon(Icons.record_voice_over_outlined, size: 13, color: _relay),
                            SizedBox(width: 6),
                            Text('UNDERSTOOD BY AI — IN ENGLISH',
                                style: TextStyle(
                                    color: _gray400, fontSize: 9,
                                    letterSpacing: 1.5, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                          ]),
                          const SizedBox(height: 8),
                          Text(
                            victimStatement,
                            style: const TextStyle(color: _gray900, fontSize: 14, height: 1.6, fontWeight: FontWeight.w600),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Photos attached note + Gemma analysis
                    if (hasImage) ...[
                      _header('PHOTOS'),
                      const SizedBox(height: 8),
                      _sectionCard(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            const Icon(Icons.photo_camera_outlined, color: _relay, size: 18),
                            const SizedBox(width: 10),
                            Text(
                              '$imageCount photo${imageCount == 1 ? '' : 's'} captured',
                              style: const TextStyle(color: _gray900, fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                          ]),
                          if (imageAnalysis.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            const Divider(height: 1, color: Color(0xFFE5E7EB)),
                            const SizedBox(height: 10),
                            Row(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                              Icon(Icons.auto_awesome, size: 12, color: _relay),
                              SizedBox(width: 6),
                              Text('AI SAW', style: TextStyle(
                                  color: _gray400, fontSize: 9,
                                  letterSpacing: 1.5, fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                            ]),
                            const SizedBox(height: 6),
                            Text(
                              imageAnalysis,
                              style: const TextStyle(color: _gray700, fontSize: 13, height: 1.5),
                            ),
                          ],
                        ]),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Voice note
                    if (hasAudio) ...[
                      _header('VOICE NOTE'),
                      const SizedBox(height: 8),
                      _sectionCard(
                        child: Row(children: [
                          const Icon(Icons.mic, color: _relay, size: 18),
                          const SizedBox(width: 10),
                          Flexible(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(
                              recordingSecs > 0
                                  ? '${recordingSecs}s voice note recorded'
                                  : 'Voice note recorded',
                              style: const TextStyle(color: _gray900, fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 2),
                            const Text(
                              'Audio uploaded to hub for transcription & emotion analysis',
                              style: TextStyle(color: _gray500, fontSize: 11),
                            ),
                          ])),
                        ]),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Location & transmission
                    _header('LOCATION & TRANSMISSION'),
                    const SizedBox(height: 8),
                    _sectionCard(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        _triageRow('Coordinates',
                            '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}', _gray700),
                        const SizedBox(height: 8),
                        _triageRow('Victim ID', victimCode, _relay),
                        const SizedBox(height: 8),
                        _triageRow(
                          'Method',
                          isRelay ? 'BLE drone relay' : 'Direct to hub',
                          isRelay ? const Color(0xFF1D4ED8) : const Color(0xFF16A34A),
                        ),
                        const SizedBox(height: 8),
                        _triageRow(
                          'E2B triage',
                          deviceTriage != null ? 'Completed on-device' : 'Hub fallback',
                          deviceTriage != null ? const Color(0xFF16A34A) : _gray500,
                        ),
                      ]),
                    ),

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),

            // Bottom action
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text(
                  'Stay where you are if it is safe to do so.',
                  style: TextStyle(color: _gray500, fontSize: 12),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      onReset(); // cleanup: cancel BLE, clear prefs
                      Navigator.of(context).popUntil((route) => route.isFirst);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _gray900,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    child: const Text('Send another SOS',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  ),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header(String text) => Text(text,
      style: const TextStyle(
          color: _gray400, fontSize: 10, letterSpacing: 2,
          fontFamily: 'monospace', fontWeight: FontWeight.w700));

  Widget _sectionCard({required Widget child, Color? color, Color? borderColor}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        border: Border.all(color: borderColor ?? _gray200),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: child,
    );
  }

  Widget _triageRow(String key, String value, Color valueColor) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(key, style: const TextStyle(color: _gray500, fontSize: 12)),
      const SizedBox(width: 8),
      Flexible(
        child: Text(value,
            textAlign: TextAlign.end,
            style: TextStyle(color: valueColor, fontSize: 12, fontWeight: FontWeight.w700)),
      ),
    ]);
  }

  Widget _labeledText(String label, String value) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label.toUpperCase(),
          style: const TextStyle(color: _gray400, fontSize: 9, letterSpacing: 1.5, fontFamily: 'monospace')),
      const SizedBox(height: 2),
      Text(value, style: const TextStyle(color: _gray700, fontSize: 12, height: 1.4)),
    ]);
  }

  String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  Color _typeColor(String type) {
    switch (type) {
      case 'medical': return const Color(0xFF7C3AED);
      case 'fire': return _critical;
      case 'flood': return const Color(0xFF2563EB);
      case 'structural': return const Color(0xFFD97706);
      case 'violence': return const Color(0xFFDC2626);
      default: return _gray500;
    }
  }

  Color _severityColor(String severity) {
    switch (severity) {
      case 'critical': return _critical;
      case 'urgent': return const Color(0xFFD97706);
      case 'low': return const Color(0xFF16A34A);
      default: return _gray500;
    }
  }
}
