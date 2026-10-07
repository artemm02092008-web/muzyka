from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Тестовые треки (пока без VK, чтобы проверить, что всё работает)
DEMO_TRACKS = [
    {
        "id": "1",
        "title": "Test Track 1",
        "artist": "Demo Artist",
        "duration": 180,
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        "cover_url": "https://picsum.photos/200"
    },
    {
        "id": "2",
        "title": "Test Track 2",
        "artist": "Demo Artist",
        "duration": 200,
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        "cover_url": "https://picsum.photos/201"
    },
    {
        "id": "3",
        "title": "Test Track 3",
        "artist": "Demo Artist",
        "duration": 220,
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        "cover_url": "https://picsum.photos/202"
    },
]

@app.route('/api/popular')
def popular():
    return jsonify({"tracks": DEMO_TRACKS})

@app.route('/api/search')
def search():
    q = request.args.get('q', '')
    return jsonify({"tracks": DEMO_TRACKS})

@app.route('/api/ping')
def ping():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)