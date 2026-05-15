uvicorn main:app --reload --port 8001 --host 0.0.0.0
python ble_relay.py --hub http://localhost:8001
flutter run -d RF8Y805SZ8D