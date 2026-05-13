import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  Future<Map<String, dynamic>> postSOS({
    required String victimCode,
    required double lat,
    required double lng,
    String? message,
    String? severity,
    String? emergencyType,
    String? audioBase64,
    bool hasAudio = false,
    bool hasImage = false,
    int hops = 0,
  }) async {
    final body = {
      'victim_code': victimCode,
      'lat': lat,
      'lng': lng,
      if (message != null) 'message': message,
      if (severity != null) 'severity': severity,
      if (emergencyType != null) 'emergency_type': emergencyType,
      if (audioBase64 != null) 'audio_base64': audioBase64,
      'has_audio': hasAudio,
      'has_image': hasImage,
      'hops': hops,
    };

    final res = await http.post(
      Uri.parse('$kApiBase/sos/'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (res.statusCode != 201 && res.statusCode != 200) {
      throw Exception('SOS failed: ${res.statusCode} ${res.body}');
    }

    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}
