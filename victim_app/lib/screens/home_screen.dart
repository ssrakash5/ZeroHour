import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../services/location_service.dart';
import 'sending_screen.dart';

// Design tokens
const _cream = Color(0xFFF5F1EB);
const _relay = Color(0xFF00C9D4);
const _critical = Color(0xFFE84040);
const _gray900 = Color(0xFF111827);
const _gray500 = Color(0xFF6B7280);
const _gray400 = Color(0xFF9CA3AF);
const _gray200 = Color(0xFFE5E7EB);
const _gray100 = Color(0xFFF3F4F6);
const _gray50 = Color(0xFFF9FAFB);

const _emergencyTypes = [
  {'value': 'medical', 'label': 'Medical', 'icon': Icons.add},
  {'value': 'trapped', 'label': 'Trapped', 'icon': Icons.shield_outlined},
  {'value': 'flood', 'label': 'Flood', 'icon': Icons.water},
  {'value': 'fire', 'label': 'Fire', 'icon': Icons.local_fire_department_outlined},
  {'value': 'unknown', 'label': 'Other', 'icon': Icons.warning_amber_outlined},
];

const _needOptions = [
  'Injured or sick',
  'Cannot move',
  'Children/elderly here',
  'Water rising',
  'Fire/smoke nearby',
  'No food/water',
];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _recorder = AudioRecorder();
  final _imagePicker = ImagePicker();

  String _victimCode = '';
  Position? _position;
  String _locationStatus = 'Tap GPS, add address, or drop a pin.';
  String _locationMode = 'gps';
  String _address = '';
  Offset _pin = const Offset(0.52, 0.46);

  List<XFile> _photos = [];
  String _emergencyType = '';
  bool _detailsOpen = false;
  int _peopleCount = 1;
  String _reporter = '';
  String _age = '';
  String _conditions = '';
  String _notes = '';
  List<String> _selectedNeeds = [];

  bool _isRecording = false;
  int _recordingSeconds = 0;
  String? _recordingPath;
  String _voiceStatus = 'Optional voice description';
  String _voiceError = '';
  Timer? _recordingTimer;

  String _warning = '';

  @override
  void initState() {
    super.initState();
    _loadVictimCode();
    _requestPermissions();
  }

  Future<void> _loadVictimCode() async {
    final prefs = await SharedPreferences.getInstance();
    String? code = prefs.getString(kVictimCodeKey);
    if (code == null) {
      final rand = Random();
      code = 'V-${(1000 + rand.nextInt(9000))}';
      await prefs.setString(kVictimCodeKey, code);
    }
    if (mounted) setState(() => _victimCode = code!);
  }

  Future<void> _requestPermissions() async {
    await [Permission.location, Permission.microphone, Permission.camera].request();
    _startGps();
  }

  void _startGps() {
    setState(() => _locationStatus = 'Finding GPS...');
    LocationService.instance.getCurrentPosition().then((pos) {
      if (mounted && pos != null) {
        setState(() {
          _position = pos;
          _locationMode = 'gps';
          _locationStatus = 'GPS locked within ${pos.accuracy.round()} m';
        });
      } else if (mounted) {
        setState(() => _locationStatus = 'GPS blocked. Use address or map pin.');
      }
    });
    LocationService.instance.positionStream().listen((pos) {
      if (mounted) setState(() => _position = pos);
    });
  }

  Future<void> _addPhotos() async {
    final picked = await _imagePicker.pickMultiImage(limit: 4);
    if (picked.isNotEmpty) {
      setState(() => _photos = [..._photos, ...picked].take(4).toList());
    }
  }

  Future<void> _startRecording() async {
    _resetVoice();
    setState(() => _voiceStatus = 'Recording voice description...');
    try {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/sos_voice.aac';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
      setState(() {
        _isRecording = true;
        _recordingSeconds = 0;
        _voiceError = '';
      });
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) { t.cancel(); return; }
        setState(() => _recordingSeconds++);
        if (_recordingSeconds >= 20) _stopRecording();
      });
    } catch (_) {
      setState(() {
        _voiceError = 'Microphone permission was blocked.';
        _voiceStatus = 'Voice note unavailable';
      });
    }
  }

  Future<void> _stopRecording() async {
    _recordingTimer?.cancel();
    final path = await _recorder.stop();
    setState(() {
      _isRecording = false;
      _recordingPath = path;
      _voiceStatus = 'Voice note attached';
    });
  }

  void _resetVoice() {
    _recordingTimer?.cancel();
    setState(() {
      _recordingPath = null;
      _recordingSeconds = 0;
      _isRecording = false;
      _voiceStatus = 'Optional voice description';
      _voiceError = '';
    });
  }

  String _formatDuration(int secs) {
    final m = secs ~/ 60;
    final s = secs % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _buildMessage() {
    final parts = <String>[
      if (_reporter.isNotEmpty) 'Reporter: $_reporter',
      'People needing help: $_peopleCount',
      if (_recordingPath != null) 'Voice note: ${_formatDuration(_recordingSeconds)} recorded',
      if (_emergencyType.isNotEmpty) 'User hint: $_emergencyType',
      if (_age.isNotEmpty) 'Age/details: $_age',
      if (_selectedNeeds.isNotEmpty) 'Needs: ${_selectedNeeds.join(', ')}',
      if (_conditions.isNotEmpty) 'Medical/conditions: $_conditions',
      if (_notes.isNotEmpty) 'Situation: $_notes',
      if (_address.isNotEmpty) 'Manual location: $_address',
      if (_position != null)
        'Coordinates: ${_position!.latitude.toStringAsFixed(5)}, ${_position!.longitude.toStringAsFixed(5)} ($_locationMode)',
      'Photos attached: ${_photos.isEmpty ? 'none' : _photos.length.toString()}',
    ];
    return parts.join('\n');
  }

  Future<void> _submit() async {
    if (_position == null && _address.trim().isEmpty) {
      setState(() => _warning = 'Add GPS, address, or a map pin so responders can find you.');
      return;
    }
    setState(() => _warning = '');

    final lat = _position?.latitude ?? -28.628;
    final lng = _position?.longitude ?? 77.209;

    String? audioBase64;
    if (_recordingPath != null) {
      final bytes = await File(_recordingPath!).readAsBytes();
      audioBase64 = base64Encode(bytes);
    }

    final report = {
      'victim_code': _victimCode,
      'lat': lat,
      'lng': lng,
      'severity': null,
      'emergency_type': _emergencyType.isEmpty ? null : _emergencyType,
      'message': _buildMessage(),
      'has_audio': _recordingPath != null,
      'has_image': _photos.isNotEmpty,
      'audio_base64': audioBase64,
      'hops': 0,
    };

    if (mounted) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => SendingScreen(report: report)),
      );
    }
  }

  @override
  void dispose() {
    _recordingTimer?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _cream,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    _buildHeader(),
                    const SizedBox(height: 16),
                    _buildPhotosCard(),
                    const SizedBox(height: 16),
                    _buildVoiceCard(),
                    const SizedBox(height: 16),
                    _buildLocationCard(),
                    const SizedBox(height: 16),
                    _buildEmergencyTypes(),
                    const SizedBox(height: 16),
                    _buildDetailsCard(),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
            _buildBottomBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(children: [
            Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF60A5FA))),
            const SizedBox(width: 6),
            const Text('connected', style: TextStyle(color: _gray500, fontSize: 12)),
          ]),
          Text(_victimCode, style: const TextStyle(color: _gray400, fontSize: 12, fontFamily: 'monospace')),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('REQUEST RESCUE', style: TextStyle(color: _gray400, fontSize: 10, letterSpacing: 3, fontFamily: 'monospace')),
        const SizedBox(height: 4),
        const Text('Send proof first.', style: TextStyle(color: _gray900, fontSize: 28, fontWeight: FontWeight.w900, height: 1.1)),
        const SizedBox(height: 6),
        const Text('Photos, voice, and location stay on top. The rest can wait.',
            style: TextStyle(color: _gray500, fontSize: 13, height: 1.5)),
        const SizedBox(height: 8),
        const Text('AI will assess the incident type and criticality from what you send.',
            style: TextStyle(color: _relay, fontSize: 12, fontWeight: FontWeight.w500)),
      ],
    );
  }

  Widget _buildPhotosCard() {
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('PHOTOS', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
            const SizedBox(height: 2),
            const Text('Show injury, flooding, collapse, or landmark.', style: TextStyle(color: _gray500, fontSize: 12)),
          ])),
          const SizedBox(width: 12),
          _darkButton(Icons.camera_alt, 'Add', _addPhotos),
        ]),
        const SizedBox(height: 12),
        if (_photos.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(color: _gray200, style: BorderStyle.solid),
              borderRadius: BorderRadius.circular(10),
              color: _gray50,
            ),
            child: const Center(child: Text('No photos added yet.', style: TextStyle(color: _gray400, fontSize: 12))),
          )
        else
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 4,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            children: _photos.map((f) => _photoThumb(f)).toList(),
          ),
      ],
    ));
  }

  Widget _photoThumb(XFile f) {
    return Stack(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.file(File(f.path), fit: BoxFit.cover, width: double.infinity, height: double.infinity),
      ),
      Positioned(
        top: 2, right: 2,
        child: GestureDetector(
          onTap: () => setState(() => _photos = _photos.where((p) => p.path != f.path).toList()),
          child: Container(
            width: 18, height: 18,
            decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withOpacity(0.6)),
            child: const Icon(Icons.close, color: Colors.white, size: 12),
          ),
        ),
      ),
    ]);
  }

  Widget _buildVoiceCard() {
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('VOICE NOTE', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
            const SizedBox(height: 2),
            Text(_voiceStatus, style: const TextStyle(color: _gray500, fontSize: 12)),
          ])),
          const SizedBox(width: 12),
          if (_isRecording)
            _redButton(Icons.pause_circle_outline, 'Stop', _stopRecording)
          else
            _darkButton(Icons.mic, 'Record', _startRecording),
        ]),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(border: Border.all(color: _gray200), borderRadius: BorderRadius.circular(10), color: _gray50),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(
                _isRecording ? 'Recording now' : _recordingPath != null ? 'Voice note ready' : 'Up to 20 seconds',
                style: TextStyle(color: _isRecording ? _critical : _gray500, fontSize: 13,
                    fontWeight: _isRecording ? FontWeight.w600 : FontWeight.normal),
              ),
              Text(_formatDuration(_recordingSeconds), style: const TextStyle(color: _gray400, fontSize: 12, fontFamily: 'monospace')),
            ]),
            if (_recordingPath != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                const Icon(Icons.play_circle_outline, color: _relay, size: 20),
                const SizedBox(width: 8),
                const Expanded(child: Text('Voice note recorded', style: TextStyle(color: _gray500, fontSize: 12))),
                GestureDetector(onTap: _resetVoice, child: const Text('Remove', style: TextStyle(color: _gray500, fontSize: 12, fontWeight: FontWeight.w600))),
              ]),
            ],
            if (_voiceError.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(_voiceError, style: const TextStyle(color: _critical, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ]),
        ),
      ],
    ));
  }

  Widget _buildLocationCard() {
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('LOCATION', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
            const SizedBox(height: 2),
            Text(_locationStatus, style: const TextStyle(color: _gray500, fontSize: 12)),
          ])),
          const Icon(Icons.location_on_outlined, color: _relay, size: 20),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _locationTab('GPS', 'gps', Icons.navigation_outlined),
          const SizedBox(width: 8),
          _locationTabLabel('Address', 'address'),
          const SizedBox(width: 8),
          _locationTabLabel('Map pin', 'pin'),
        ]),
        if (_locationMode == 'address') ...[
          const SizedBox(height: 12),
          TextField(
            onChanged: (v) => setState(() { _address = v; if (v.isNotEmpty) _locationStatus = 'Manual address added.'; }),
            style: const TextStyle(fontSize: 13),
            decoration: InputDecoration(
              hintText: 'Street, building, landmark...',
              hintStyle: const TextStyle(color: _gray400, fontSize: 13),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _gray200)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _gray200)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _relay)),
              filled: true, fillColor: Colors.white,
            ),
          ),
        ],
        if (_locationMode == 'pin') ...[
          const SizedBox(height: 12),
          _buildMapPin(),
        ],
        if (_position != null) ...[
          const SizedBox(height: 6),
          Text('${_position!.latitude.toStringAsFixed(5)}, ${_position!.longitude.toStringAsFixed(5)}',
              style: const TextStyle(color: _gray400, fontSize: 10, fontFamily: 'monospace')),
        ],
      ],
    ));
  }

  Widget _locationTab(String label, String mode, IconData icon) {
    final active = _locationMode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() => _locationMode = mode);
          if (mode == 'gps') _startGps();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            border: Border.all(color: active ? _relay : _gray200),
            borderRadius: BorderRadius.circular(8),
            color: active ? _relay.withOpacity(0.08) : Colors.white,
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, size: 13, color: active ? const Color(0xFF0E7490) : _gray500),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: active ? const Color(0xFF0E7490) : _gray500, fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
        ),
      ),
    );
  }

  Widget _locationTabLabel(String label, String mode) {
    final active = _locationMode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _locationMode = mode),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            border: Border.all(color: active ? _relay : _gray200),
            borderRadius: BorderRadius.circular(8),
            color: active ? _relay.withOpacity(0.08) : Colors.white,
          ),
          child: Center(child: Text(label, style: TextStyle(
            color: active ? const Color(0xFF0E7490) : _gray500, fontSize: 12, fontWeight: FontWeight.w700))),
        ),
      ),
    );
  }

  Widget _buildMapPin() {
    return GestureDetector(
      onTapDown: (d) {
        final box = context.findRenderObject() as RenderBox?;
        if (box == null) return;
        setState(() => _locationStatus = 'Map pin set.');
      },
      child: LayoutBuilder(builder: (ctx, constraints) {
        return GestureDetector(
          onTapDown: (d) {
            final rx = d.localPosition.dx / constraints.maxWidth;
            final ry = d.localPosition.dy / 96;
            setState(() {
              _pin = Offset(rx.clamp(0.04, 0.96), ry.clamp(0.08, 0.92));
              _locationStatus = 'Map pin set.';
            });
          },
          child: Container(
            height: 96,
            decoration: BoxDecoration(color: const Color(0xFFDDE6DB), borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _gray200)),
            child: Stack(children: [
              Positioned.fill(child: CustomPaint(painter: _GridPainter())),
              Positioned(
                left: constraints.maxWidth * _pin.dx - 14,
                top: 96 * _pin.dy - 28,
                child: const Icon(Icons.location_on, color: _critical, size: 28),
              ),
              const Positioned(bottom: 6, left: 10,
                child: Text('tap near your position', style: TextStyle(color: _gray500, fontSize: 9, fontFamily: 'monospace'))),
            ]),
          ),
        );
      }),
    );
  }

  Widget _buildEmergencyTypes() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('WHAT HAPPENED?', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
            SizedBox(height: 2),
            Text('Optional hint only. Leave blank if unsure.', style: TextStyle(color: _gray500, fontSize: 12)),
          ]),
          GestureDetector(
            onTap: () => setState(() => _emergencyType = ''),
            child: const Text('CLEAR', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1)),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: _emergencyTypes.map((e) {
          final val = e['value'] as String;
          final active = _emergencyType == val;
          return Expanded(child: GestureDetector(
            onTap: () => setState(() => _emergencyType = val),
            child: Container(
              margin: EdgeInsets.only(right: val == 'unknown' ? 0 : 6),
              height: 64,
              decoration: BoxDecoration(
                color: active ? _gray900 : Colors.white.withOpacity(0.7),
                border: Border.all(color: active ? _gray900 : _gray200),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(e['icon'] as IconData, size: 18, color: active ? Colors.white : _gray500, weight: 2.2),
                const SizedBox(height: 4),
                Text(e['label'] as String, style: TextStyle(
                    color: active ? Colors.white : _gray500, fontSize: 10, fontWeight: FontWeight.w700)),
              ]),
            ),
          ));
        }).toList()),
      ],
    );
  }

  Widget _buildDetailsCard() {
    return _card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => setState(() => _detailsOpen = !_detailsOpen),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('ADDITIONAL DETAILS', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
              const SizedBox(height: 2),
              const Text('People, injuries, and anything else responders should know.',
                  style: TextStyle(color: _gray500, fontSize: 12)),
            ])),
            Icon(_detailsOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down, color: _gray400),
          ]),
        ),
        if (_detailsOpen) ...[
          const SizedBox(height: 16),
          // People counter
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Text('PEOPLE', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
            const Icon(Icons.people_outline, color: _gray400, size: 18),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            _counterBtn('-', () => setState(() => _peopleCount = (_peopleCount - 1).clamp(1, 30))),
            const SizedBox(width: 10),
            Expanded(child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(border: Border.all(color: _gray200), borderRadius: BorderRadius.circular(8), color: Colors.white),
              child: Center(child: RichText(text: TextSpan(children: [
                TextSpan(text: '$_peopleCount', style: const TextStyle(color: _gray900, fontSize: 22, fontWeight: FontWeight.w900)),
                const TextSpan(text: ' people', style: TextStyle(color: _gray400, fontSize: 13)),
              ]))),
            )),
            const SizedBox(width: 10),
            _counterBtn('+', () => setState(() => _peopleCount = (_peopleCount + 1).clamp(1, 30))),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _dropdown()),
            const SizedBox(width: 8),
            Expanded(child: _textInput('Age/details', (v) => _age = v)),
          ]),
          const SizedBox(height: 16),
          const Text('QUICK NEEDS', style: TextStyle(color: _gray400, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 2)),
          const SizedBox(height: 4),
          const Text('Nothing is preselected.', style: TextStyle(color: _gray500, fontSize: 12)),
          const SizedBox(height: 8),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            childAspectRatio: 3.5,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
            children: _needOptions.map((n) {
              final active = _selectedNeeds.contains(n);
              return GestureDetector(
                onTap: () => setState(() => active ? _selectedNeeds.remove(n) : _selectedNeeds.add(n)),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: active ? _gray900 : Colors.white.withOpacity(0.7),
                    border: Border.all(color: active ? _gray900 : _gray200),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(n, style: TextStyle(color: active ? Colors.white : const Color(0xFF374151),
                      fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          _textInput('Medical conditions, injuries, pregnancy, disability...', (v) => _conditions = v),
          const SizedBox(height: 8),
          _multilineInput('Anything else responders should know.', (v) => _notes = v),
        ],
      ],
    ));
  }

  Widget _buildBottomBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      decoration: const BoxDecoration(
        color: _cream,
        border: Border(top: BorderSide(color: _gray200)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (_warning.isNotEmpty) ...[
          Text(_warning, style: const TextStyle(color: _critical, fontSize: 12, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          const SizedBox(height: 8),
        ],
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _submit,
            icon: const Icon(Icons.send, size: 16),
            label: const Text('Send rescue request', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            style: ElevatedButton.styleFrom(
              backgroundColor: _critical,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 4,
              shadowColor: _critical.withOpacity(0.4),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _counterBtn(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(border: Border.all(color: _gray200), borderRadius: BorderRadius.circular(8), color: Colors.white),
        child: Center(child: Text(label, style: const TextStyle(color: _gray500, fontSize: 18, fontWeight: FontWeight.w700))),
      ),
    );
  }

  Widget _dropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(border: Border.all(color: _gray200), borderRadius: BorderRadius.circular(8), color: Colors.white),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _reporter.isEmpty ? null : _reporter,
          hint: const Text('Who is reporting?', style: TextStyle(color: _gray400, fontSize: 12)),
          isExpanded: true,
          style: const TextStyle(color: _gray900, fontSize: 13),
          items: ['Me', 'Family member', 'Bystander', 'Unknown']
              .map((r) => DropdownMenuItem(value: r, child: Text(r)))
              .toList(),
          onChanged: (v) => setState(() => _reporter = v ?? ''),
        ),
      ),
    );
  }

  Widget _textInput(String hint, ValueChanged<String> onChanged) {
    return TextField(
      onChanged: onChanged,
      style: const TextStyle(fontSize: 13),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: _gray400, fontSize: 13),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _gray200)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _gray200)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _relay)),
        filled: true, fillColor: Colors.white,
      ),
    );
  }

  Widget _multilineInput(String hint, ValueChanged<String> onChanged) {
    return TextField(
      onChanged: onChanged,
      maxLines: 3,
      style: const TextStyle(fontSize: 13),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: _gray400, fontSize: 13),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _gray200)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _gray200)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _relay)),
        filled: true, fillColor: Colors.white,
      ),
    );
  }

  Widget _card(Widget child) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.8),
        border: Border.all(color: _gray200),
        borderRadius: BorderRadius.circular(14),
      ),
      child: child,
    );
  }

  Widget _darkButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: _gray900, borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: Colors.white, size: 16),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }

  Widget _redButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: _critical, borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: Colors.white, size: 16),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withOpacity(0.6)..strokeWidth = 0.5;
    for (final x in [0.18, 0.44, 0.72]) {
      canvas.drawLine(Offset(size.width * x, 0), Offset(size.width * x, size.height), paint);
    }
    for (final y in [0.32, 0.64]) {
      canvas.drawLine(Offset(0, size.height * y), Offset(size.width, size.height * y), paint);
    }
  }

  @override
  bool shouldRepaint(_) => false;
}
