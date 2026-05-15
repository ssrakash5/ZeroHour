import 'dart:convert';
import 'package:flutter/services.dart';
import '../config.dart';

class GemmaService {
  GemmaService._();
  static final GemmaService instance = GemmaService._();

  static const MethodChannel _channel = MethodChannel('com.zerohour/gemma');

  bool _ready = false;
  bool get isReady => _ready;

  Future<bool> initialize() async {
    try {
      final modelPath = '$kModelDownloadDir/$kModelFileName';
      print('[GemmaService] initializing from $modelPath');
      final ok = await _channel.invokeMethod<bool>('initialize', {'modelPath': modelPath});
      _ready = ok == true;
      print('[GemmaService] initialized: $_ready');
      return _ready;
    } on PlatformException catch (e) {
      print('[GemmaService] init failed: $e');
      _ready = false;
      return false;
    }
  }

  /// Full E2B triage — passes photos and audio directly to Gemma 4 multimodal.
  Future<Map<String, dynamic>?> triage(
    String input, {
    List<String>? imagePaths,
    String? audioPath,
    int? audioDurationSeconds,
  }) async {
    if (!_ready) return null;

    final hasMedia = (imagePaths != null && imagePaths.isNotEmpty) || audioPath != null;
    final mediaHint = hasMedia
        ? '\nAttached media: analyze all photos and/or voice note for the victim\'s situation.'
        : '';
    final audioHint = (!hasMedia && audioDurationSeconds != null && audioDurationSeconds > 0)
        ? '\nVoice note: ${audioDurationSeconds}s recorded.'
        : '';

    final prompt =
        'You are an emergency triage AI. Output exactly ONE JSON object with no repeated keys.\n\n'
        'SOS CONTEXT:\n$input\n'
        '$mediaHint$audioHint\n\n'
        'Analyze all available input (text, audio, photos). '
        'Write all text fields in plain English only.\n\n'
        'Single JSON object:\n'
        '{"emergency_type":"medical|fire|flood|structural|violence|unknown",'
        '"severity":"critical|urgent|low",'
        '"people_count":1,'
        '"quick_needs":"immediate needs in one short English phrase",'
        '"message":"one sentence English triage summary",'
        '"victim_statement":"plain English summary of what the victim said or reported — no romanized foreign words",'
        '"image_analysis":"one or two English sentences describing what is visible in the photos, or empty string if no photos"}';

    try {
      print('[GemmaService] triage — images=${imagePaths?.length ?? 0} audio=${audioPath != null}');
      final response = await _channel.invokeMethod<String>('triage', {
        'prompt': prompt,
        if (imagePaths != null && imagePaths.isNotEmpty) 'imagePaths': imagePaths,
        if (audioPath != null) 'audioPath': audioPath,
      });
      print('[GemmaService] raw response: $response');
      if (response == null) return null;

      final jsonMatch = RegExp(r'\{[\s\S]*\}').firstMatch(response.trim());
      if (jsonMatch == null) {
        print('[GemmaService] no JSON found in response');
        return null;
      }

      final rawJson = jsonMatch.group(0)!;

      // Gemma sometimes generates duplicate keys (one per input line).
      // Standard jsonDecode picks the LAST value — we want the best native-language one.
      final result = jsonDecode(rawJson) as Map<String, dynamic>;
      result['victim_statement'] = _bestValue(rawJson, 'victim_statement');
      result['image_analysis'] = _bestValue(rawJson, 'image_analysis');
      return result;
    } on PlatformException catch (e) {
      print('[GemmaService] triage PlatformException: $e');
      return null;
    } catch (e) {
      print('[GemmaService] triage error: $e');
      return null;
    }
  }

  /// Extracts all values for a possibly-duplicated JSON key and returns the
  /// most "natural language" one — longest value that isn't metadata or prompt text.
  String _bestValue(String rawJson, String key) {
    final pattern = RegExp('"$key":\\s*"((?:[^"\\\\]|\\\\.)*)"');
    final values = pattern
        .allMatches(rawJson)
        .map((m) => m.group(1)!.replaceAll('\\"', '"').replaceAll('\\n', '\n'))
        .toList();

    if (values.isEmpty) return '';

    // Skip values that look like metadata labels or the leaked prompt
    final skipPatterns = RegExp(
      r'^(Tasks:|You are|People needing|User hint|Voice note|Photos|Coordinates|GPS|Reporter|'
      r'medical|fire|flood|structural|violence|unknown|critical|urgent|low|'
      r'Analyze|Normalize|Classify|Summarize|Reply|Output|Single|Attached)',
      caseSensitive: false,
    );

    final candidates = values.where((v) => v.length > 8 && !skipPatterns.hasMatch(v)).toList();

    if (candidates.isEmpty) return values.first;
    // Among candidates, prefer the longest (most descriptive native-language content)
    candidates.sort((a, b) => b.length.compareTo(a.length));
    return candidates.first;
  }

  /// Like _bestValue but for original_transcript: prefers values containing
  /// non-ASCII characters (native script — Telugu, Hindi, Arabic, etc.) over
  /// pure-English values, since Gemma may produce both and the English one is
  /// often longer.
  String _bestNativeValue(String rawJson, String key) {
    final pattern = RegExp('"$key":\\s*"((?:[^"\\\\]|\\\\.)*)"');
    final values = pattern
        .allMatches(rawJson)
        .map((m) => m.group(1)!.replaceAll('\\"', '"').replaceAll('\\n', '\n'))
        .toList();

    if (values.isEmpty) return '';

    final skipPatterns = RegExp(
      r'^(Tasks:|You are|People needing|User hint|Voice note|Photos|Coordinates|GPS|Reporter|'
      r'medical|fire|flood|structural|violence|unknown|critical|urgent|low|'
      r'Analyze|Normalize|Classify|Summarize|Reply|Output|Single|Attached)',
      caseSensitive: false,
    );

    final candidates = values.where((v) => v.length > 8 && !skipPatterns.hasMatch(v)).toList();
    if (candidates.isEmpty) return values.first;

    // First priority: values with non-ASCII characters (actual native script)
    final nativeCandidates = candidates.where((v) => v.runes.any((r) => r > 127)).toList();
    if (nativeCandidates.isNotEmpty) {
      nativeCandidates.sort((a, b) => b.length.compareTo(a.length));
      return nativeCandidates.first;
    }

    // Fallback: longest candidate (romanised native or only option)
    candidates.sort((a, b) => b.length.compareTo(a.length));
    return candidates.first;
  }
}
