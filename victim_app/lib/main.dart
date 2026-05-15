import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import 'screens/acknowledged_screen.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));
  runApp(const ZeroHourApp());
}

class ZeroHourApp extends StatelessWidget {
  const ZeroHourApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ZeroHour',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFF5F1EB),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFFE84040),
          surface: Colors.white,
        ),
      ),
      home: const _StartupRouter(),
    );
  }
}

class _StartupRouter extends StatefulWidget {
  const _StartupRouter();

  @override
  State<_StartupRouter> createState() => _StartupRouterState();
}

class _StartupRouterState extends State<_StartupRouter> {
  Map<String, dynamic>? _savedSos;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kLastSosKey);
    if (mounted) {
      setState(() {
        _savedSos = raw != null ? jsonDecode(raw) as Map<String, dynamic> : null;
        _loaded = true;
      });
    }
  }

  Future<void> _clearAndReset() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(kLastSosKey);
    if (mounted) setState(() => _savedSos = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const Scaffold(
        backgroundColor: Color(0xFFF5F1EB),
        body: SizedBox.shrink(),
      );
    }
    if (_savedSos != null) {
      return AcknowledgedScreen(
        result: _savedSos!,
        onReset: _clearAndReset,
      );
    }
    return const HomeScreen();
  }
}
