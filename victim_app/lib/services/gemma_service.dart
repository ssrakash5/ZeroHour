import 'dart:convert';
import 'dart:io';
import 'package:flutter_gemma/flutter_gemma.dart';
import 'package:path_provider/path_provider.dart';
import '../config.dart';

class GemmaService {
  GemmaService._();
  static final GemmaService instance = GemmaService._();

  bool _ready = false;
  bool get isReady => _ready;

  Future<bool> initialize() async {
    try {
      await FlutterGemma.initialize();

      final src = File('$kModelDownloadDir/$kModelFileName');
      if (!await src.exists()) return false;

      final appDir = await getApplicationDocumentsDirectory();
      final dest = File('${appDir.path}/$kModelFileName');
      if (!await dest.exists()) {
        await src.copy(dest.path);
      }

      await FlutterGemma.installModel(
        modelType: ModelType.gemma4,
        fileType: ModelFileType.binary,
      ).fromFile(dest.path).install();

      _ready = true;
      return true;
    } catch (_) {
      _ready = false;
      return false;
    }
  }

  Future<Map<String, dynamic>?> triage(String input) async {
    if (!_ready) return null;

    final prompt =
        'Emergency triage. Victim says: "$input"\n\n'
        'Reply ONLY with valid JSON:\n'
        '{"emergency_type":"medical|fire|flood|structural|violence|unknown",'
        '"severity":"critical|urgent|low","people_count":1,'
        '"quick_needs":"what they need immediately","message":"one sentence summary"}';

    try {
      final model = await FlutterGemma.getActiveModel(maxTokens: 256);
      final chat = await model.createChat(temperature: 0.3, topK: 1);

      await chat.addQuery(Message(text: prompt, isUser: true));
      final response = await chat.generateChatResponse();
      await model.close();

      final raw = response is TextResponse ? response.token.trim() : '';
      final jsonMatch = RegExp(r'\{[\s\S]*?\}').firstMatch(raw);
      if (jsonMatch == null) return null;

      return jsonDecode(jsonMatch.group(0)!) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
