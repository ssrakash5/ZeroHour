import 'package:flutter/material.dart';

class StatusScreen extends StatelessWidget {
  final Map<String, dynamic> response;
  const StatusScreen({super.key, required this.response});

  @override
  Widget build(BuildContext context) {
    final sos = response['sos'] as Map<String, dynamic>?;
    final assignment = response['assignment'] as Map<String, dynamic>?;
    final triage = response['triage'] as Map<String, dynamic>?;

    final severity = sos?['severity'] as String? ?? 'unknown';
    final emergencyType = sos?['emergency_type'] as String? ?? 'unknown';
    final responderCode = assignment?['responder_code'] as String? ?? '—';
    final responderName = assignment?['responder_name'] as String? ?? '—';
    final etaMinutes = assignment?['eta_minutes'];
    final distanceM = assignment?['distance_m'];
    final aiReason = assignment?['ai_reason'] as String?;

    final severityColor = switch (severity) {
      'critical' => const Color(0xFFE84040),
      'urgent'   => const Color(0xFFF59E0B),
      _          => const Color(0xFF6B7A8D),
    };

    return Scaffold(
      backgroundColor: const Color(0xFF080808),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Back
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.arrow_back_ios, color: Color(0xFF6B7280), size: 14),
                    SizedBox(width: 4),
                    Text('Back', style: TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
                  ],
                ),
              ),

              const SizedBox(height: 32),

              // "Help is on the way" hero
              if (assignment != null) ...[
                const Text(
                  'Help is\non the way.',
                  style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1.1),
                ),
              ] else ...[
                const Text(
                  'SOS sent.\nFinding responder…',
                  style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1.1),
                ),
              ],

              const SizedBox(height: 32),

              // Severity + type chips
              Row(
                children: [
                  _Chip(label: severity.toUpperCase(), color: severityColor),
                  const SizedBox(width: 8),
                  _Chip(label: emergencyType.replaceAll('_', ' ').toUpperCase(), color: const Color(0xFF374151)),
                ],
              ),

              const SizedBox(height: 24),

              // Responder card
              if (assignment != null)
                _InfoCard(children: [
                  _InfoRow(label: 'RESPONDER', value: '$responderCode · $responderName'),
                  if (etaMinutes != null)
                    _InfoRow(label: 'ETA', value: '$etaMinutes min'),
                  if (distanceM != null)
                    _InfoRow(label: 'DISTANCE', value: '${distanceM}m away'),
                ]),

              const SizedBox(height: 16),

              // AI reasoning
              if (aiReason != null)
                _InfoCard(children: [
                  const Text('AI DISPATCH REASON', style: TextStyle(color: Color(0xFF6B7280), fontSize: 10, letterSpacing: 2)),
                  const SizedBox(height: 8),
                  Text(aiReason, style: const TextStyle(color: Color(0xFFD1D5DB), fontSize: 13, height: 1.5)),
                ]),

              if (triage != null) ...[
                const SizedBox(height: 16),
                _InfoCard(children: [
                  const Text('ON-DEVICE GEMMA TRIAGE', style: TextStyle(color: Color(0xFF00C9D4), fontSize: 10, letterSpacing: 2)),
                  const SizedBox(height: 8),
                  if (triage['reason'] != null)
                    Text(triage['reason'] as String, style: const TextStyle(color: Color(0xFFD1D5DB), fontSize: 13, height: 1.5)),
                ]),
              ],

              const Spacer(),

              // Stay safe note
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFE84040).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE84040).withOpacity(0.2)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Color(0xFFE84040), size: 18),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Stay where you are. Keep this screen open. Your location is being shared.',
                        style: TextStyle(color: Color(0xFFE84040), fontSize: 12, height: 1.5),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final List<Widget> children;
  const _InfoCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1F2937)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 10, letterSpacing: 1.5)),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'monospace', fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
