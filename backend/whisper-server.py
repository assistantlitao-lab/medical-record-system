#!/usr/bin/env python3
"""
Whisper transcription server that runs on the Mac host.
Listens for audio files and returns transcriptions.
"""

import sys
import os
import tempfile
import subprocess
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Add current directory to path for faster-whisper
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Use faster-whisper if available, otherwise use whisper CLI
try:
    from faster_whisper import WhisperModel
    USE_FASTER_WHISPER = True
    print("Using faster-whisper")
except ImportError:
    USE_FASTER_WHISPER = False
    print("Using whisper CLI")

# Configuration
PORT = 8765
MODEL_SIZE = "base"  # tiny, base, small, medium, large

# Initialize model if using faster-whisper
model = None
if USE_FASTER_WHISPER:
    try:
        model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
        print(f"Loaded whisper model: {MODEL_SIZE}")
    except Exception as e:
        print(f"Failed to load model: {e}")
        USE_FASTER_WHISPER = False


class TranscriptionHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_POST(self):
        if self.path != '/transcribe':
            self.send_error(404, "Not found")
            return

        # Get content length
        content_length = int(self.headers.get('Content-Length', 0))

        # Read the audio file
        audio_data = self.rfile.read(content_length)

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        try:
            if USE_FASTER_WHISPER and model:
                # Use faster-whisper, force Simplified Chinese
                segments, info = model.transcribe(temp_path, language='zh-cn')
                transcription = ' '.join([segment.text for segment in segments])
            else:
                # Use whisper CLI
                result = subprocess.run(
                    ['whisper', '--model', MODEL_SIZE, '--language', 'Chinese',
                     '--output_dir', '/tmp', '--output_format', 'txt', temp_path],
                    capture_output=True,
                    text=True
                )
                # Read the output file
                txt_path = temp_path.replace('.wav', '.txt')
                if os.path.exists(txt_path):
                    with open(txt_path, 'r', encoding='utf-8') as f:
                        transcription = f.read()
                else:
                    transcription = result.stdout + result.stderr

            # Send success response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'transcription': transcription
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())

        finally:
            # Cleanup
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            # Cleanup whisper output
            txt_path = temp_path.replace('.wav', '.txt')
            if os.path.exists(txt_path):
                os.unlink(txt_path)


def main():
    server = HTTPServer(('0.0.0.0', PORT), TranscriptionHandler)
    print(f"Whisper transcription server running on port {PORT}")
    server.serve_forever()


if __name__ == '__main__':
    main()
