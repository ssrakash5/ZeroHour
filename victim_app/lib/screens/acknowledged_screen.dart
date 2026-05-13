import 'package:flutter/material.dart';

const _cream = Color(0xFFF5F1EB);
const _relay = Color(0xFF00C9D4);
const _critical = Color(0xFFE84040);
const _gray900 = Color(0xFF111827);
const _gray500 = Color(0xFF6B7280);
const _gray400 = Color(0xFF9CA3AF);
const _gray200 = Color(0xFFE5E7EB);
const _gray100 = Color(0xFFF3F4F6);

const _trackSteps = [
  {'key': 'received', 'label': 'Received by hub'},
  {'key': 'triaged', 'label': 'Triage complete'},
  {'key': 'assigned', 'label': 'Responder assigned'},
  {'key': 'route', 'label': 'Tracking route'},
];

class AcknowledgedScreen extends StatelessWidget {
  final Map<String, dynamic> result;
  final VoidCallback onReset;
  const AcknowledgedScreen({super.key, required this.result, required this.onReset});

  @override
  Widget build(BuildContext context) {
    final sos = result['sos'] as Map<String, dynamic>?;
    final assignment = result['assignment'] as Map<String, dynamic>?;
    final triage = result['triage'] as Map<String, dynamic>?;

    final victimCode = sos?['victim_code'] as String? ?? 'V-0000';
    final responderName = assignment?['responder_name'] as String? ?? 'Responder team';
    final responderCode = assignment?['responder_code'] as String? ?? 'Hub';
    final responderRole = assignment?['responder_role'] as String? ?? 'dispatch';
    final responderSector = assignment?['responder_sector'] as String? ?? 'local';
    final eta = assignment?['eta_minutes'];
    final distance = assignment?['distance_m'];
    final lat = sos?['lat'];
    final lng = sos?['lng'];
    final hasImage = sos?['has_image'] == true;
    final hasAudio = sos?['has_audio'] == true;
    final status = sos?['status'] as String? ?? 'submitted';
    final aiReason = assignment?['ai_reason'] as String?;
    final triageReason = triage?['reason'] as String?;
    final severity = (triage?['severity'] ?? sos?['severity']) as String?;
    final emergencyType = (triage?['emergency_type'] ?? sos?['emergency_type']) as String?;
    final packetCode = sos?['packet_code'] as String? ?? 'sent';

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
                  Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF22C55E))),
                  const SizedBox(width: 6),
                  const Text('tracking live', style: TextStyle(color: Color(0xFF16A34A), fontSize: 12, fontWeight: FontWeight.w500)),
                ]),
                Text(victimCode, style: const TextStyle(color: _gray400, fontSize: 12, fontFamily: 'monospace')),
              ]),
            ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    Text('PACKET $packetCode', style: const TextStyle(color: _relay, fontSize: 10, letterSpacing: 3, fontFamily: 'monospace')),
                    const SizedBox(height: 4),
                    const Text('Rescue is now\nbeing tracked.', style: TextStyle(color: _gray900, fontSize: 30, fontWeight: FontWeight.w900, height: 1.1)),
                    const SizedBox(height: 8),
                    const Text('Once a team is assigned, this screen shows the handoff and route status.',
                        style: TextStyle(color: _gray500, fontSize: 13, height: 1.5)),
                    const SizedBox(height: 20),

                    // Responder card
                    _card(Column(children: [
                      Row(children: [
                        Container(
                          width: 48, height: 48,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: _relay.withOpacity(0.1)),
                          child: const Icon(Icons.shield_outlined, color: _relay, size: 22),
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('$responderCode - $responderName',
                              style: const TextStyle(color: _gray900, fontSize: 15, fontWeight: FontWeight.w700)),
                          Text(
                            assignment != null ? '$responderRole - sector $responderSector' : 'Awaiting responder assignment',
                            style: const TextStyle(color: _gray400, fontSize: 12),
                          ),
                        ])),
                      ]),
                      const SizedBox(height: 16),
                      const Divider(color: _gray200, height: 1),
                      const SizedBox(height: 16),
                      Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('ETA', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 2, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          RichText(text: TextSpan(children: [
                            TextSpan(text: eta?.toString() ?? '--', style: const TextStyle(color: _gray900, fontSize: 26, fontWeight: FontWeight.w900)),
                            const TextSpan(text: ' min', style: TextStyle(color: _gray400, fontSize: 14, fontWeight: FontWeight.w600)),
                          ])),
                        ])),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('DISTANCE', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 2, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          RichText(text: TextSpan(children: [
                            TextSpan(text: distance?.toString() ?? '--', style: const TextStyle(color: _gray900, fontSize: 26, fontWeight: FontWeight.w900)),
                            const TextSpan(text: ' m', style: TextStyle(color: _gray400, fontSize: 14, fontWeight: FontWeight.w600)),
                          ])),
                        ])),
                      ]),
                    ])),
                    const SizedBox(height: 16),

                    // Tracking steps
                    _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        const Icon(Icons.waves, color: _relay, size: 16),
                        const SizedBox(width: 8),
                        const Text('TRACKING STATUS', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 2, fontWeight: FontWeight.w700)),
                      ]),
                      const SizedBox(height: 12),
                      ...List.generate(_trackSteps.length, (i) {
                        final step = _trackSteps[i];
                        final active = assignment != null ? true : i < 2;
                        final key = step['key']!;
                        String subtitle = active ? 'Completed' : 'Waiting';
                        if (key == 'route' && assignment != null) subtitle = 'Responder route is now attached to your request.';
                        if (key == 'assigned' && assignment != null) subtitle = '$responderCode accepted this request.';

                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          child: Row(children: [
                            Container(
                              width: 28, height: 28,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: active ? _relay : _gray200),
                                color: active ? _relay.withOpacity(0.1) : Colors.transparent,
                              ),
                              child: Icon(Icons.check, size: 14, color: active ? _relay : _gray200),
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(step['label']!, style: TextStyle(
                                  color: active ? _gray900 : _gray400, fontSize: 13, fontWeight: FontWeight.w600)),
                              Text(subtitle, style: const TextStyle(color: _gray400, fontSize: 11)),
                            ])),
                          ]),
                        );
                      }),
                    ])),
                    const SizedBox(height: 16),

                    // Hub data
                    _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('WHAT THE HUB HAS', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 2, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      _hubRow(Icons.check_circle, const Color(0xFF22C55E), 'Status: ${assignment != null ? 'assigned and tracked' : status}'),
                      if (lat != null && lng != null)
                        _hubRow(Icons.location_on, _relay,
                            '${(lat as num).toStringAsFixed(5)}, ${(lng as num).toStringAsFixed(5)}'),
                      _hubRow(Icons.check_circle, const Color(0xFF22C55E), 'Photos: ${hasImage ? 'attached' : 'not attached'}'),
                      _hubRow(Icons.check_circle, const Color(0xFF22C55E), 'Voice note: ${hasAudio ? 'attached' : 'not attached'}'),
                      _hubRow(Icons.check_circle, const Color(0xFF22C55E),
                          'AI triage: ${severity ?? 'pending'} / ${emergencyType ?? 'pending'}'),
                      if (triageReason != null || aiReason != null) ...[
                        const Divider(color: _gray200, height: 20),
                        if (triageReason != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: RichText(text: TextSpan(children: [
                              const TextSpan(text: 'Criticality reasoning: ', style: TextStyle(color: _gray900, fontSize: 12, fontWeight: FontWeight.w600)),
                              TextSpan(text: triageReason, style: const TextStyle(color: _gray500, fontSize: 12)),
                            ])),
                          ),
                        if (aiReason != null)
                          Text(aiReason, style: const TextStyle(color: _gray400, fontSize: 12, fontStyle: FontStyle.italic)),
                      ],
                    ])),
                    const SizedBox(height: 16),

                    // While you wait
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.6),
                        border: Border.all(color: _gray200),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('WHILE YOU WAIT', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 2, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        const Text(
                          'Stay where you are if it is safe. Keep the phone nearby and visible so updates remain tied to this request.',
                          style: TextStyle(color: _gray900, fontSize: 13, height: 1.5),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: onReset,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _gray500,
                    side: const BorderSide(color: _gray200),
                    backgroundColor: Colors.white.withOpacity(0.7),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: const Text('Start another request', style: TextStyle(fontSize: 13)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hubRow(IconData icon, Color color, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Icon(icon, color: color, size: 17),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(color: _gray900, fontSize: 13))),
      ]),
    );
  }
}

Widget _card(Widget child) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE5E7EB)),
      borderRadius: BorderRadius.circular(14),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
    ),
    child: child,
  );
}
