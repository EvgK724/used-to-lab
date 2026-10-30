#!/usr/bin/env python3
"""Generate and verify complete Microsoft Ryan speech. No device-voice fallback.

python tools/audio.py         # generates only missing/invalid clips
python tools/audio.py --check # verifies text coverage and decodes every MP3
Dependencies: edge-tts==7.3.1 imageio-ffmpeg==0.6.0
"""
import argparse
import asyncio
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
VOICE = 'en-GB-RyanNeural'
RATE = '-4%'


def text_id(text):
    value = 2166136261
    for byte in text.encode('utf-8'):
        value = ((value ^ byte) * 16777619) & 0xffffffff
    return f'{value:08x}'


def expected_texts():
    data = json.loads((ROOT / 'content.json').read_text('utf-8'))
    texts = []
    for lesson in data['lessons']:
        texts.extend(example['en'] for example in lesson['examples'])
        texts.extend([lesson['trap']['right'], lesson['recall']['answer']])
    texts.extend(exercise['answer'] for exercise in data['exercises'])
    result = {}
    for raw in texts:
        text = raw.strip()
        if not text or '<' in text or '___' in text:
            raise ValueError(f'Invalid audio sentence: {text!r}')
        key = text_id(text)
        if key in result and result[key] != text:
            raise ValueError(f'Audio hash collision: {key}')
        result[key] = text
    return dict(sorted(result.items()))


def verify_clip(path):
    import imageio_ffmpeg
    if not path.is_file() or path.stat().st_size < 900:
        raise ValueError(f'Missing or empty MP3: {path.name}')
    process = subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-nostdin',
        '-v', 'info', '-xerror', '-i', str(path), '-af', 'volumedetect',
        '-f', 'null', '-'
    ], capture_output=True, text=True, timeout=45)
    if process.returncode:
        raise ValueError(f'MP3 decode failed: {path.name}: {process.stderr[-500:]}')
    volume = re.search(r'max_volume: (-?[\d.]+|inf) dB', process.stderr)
    duration = re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)', process.stderr)
    if not volume or float(volume.group(1)) < -60 or not duration:
        raise ValueError(f'Missing/silent MP3: {path.name}')
    hours, minutes, seconds = map(float, duration.groups())
    length = hours * 3600 + minutes * 60 + seconds
    if not (0.25 <= length <= 90) or not math.isfinite(float(volume.group(1))):
        raise ValueError(f'Invalid duration or audio volume: {path.name}')
    return {'seconds': round(length, 3), 'bytes': path.stat().st_size, 'maxDb': float(volume.group(1))}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False, suffix='.tmp') as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write('\n')
        temporary = file.name
    os.replace(temporary, path)


def verify_all(texts):
    actual = json.loads((ROOT / 'audio/index.json').read_text('utf-8'))
    if actual.get('voice') != VOICE or actual.get('texts') != texts or actual.get('files') != sorted(texts):
        raise ValueError('Audio index does not exactly match current content and Ryan voice')
    clips = {key: verify_clip(ROOT / 'audio' / f'{key}.mp3') for key in texts}
    report = {'voice': VOICE, 'rate': RATE, 'count': len(clips), 'complete': True,
              'bytes': sum(clip['bytes'] for clip in clips.values()), 'clips': clips}
    write_json(ROOT / 'qa/audio-report.json', report)
    print(f'PASS: {len(clips)} Ryan MP3 files, all expected text covered, all fully decoded and non-silent.', flush=True)


async def generate(texts, concurrency):
    import edge_tts
    directory = ROOT / 'audio'
    directory.mkdir(exist_ok=True)
    semaphore = asyncio.Semaphore(concurrency)
    complete = 0

    async def one(key, text):
        nonlocal complete
        async with semaphore:
            destination = directory / f'{key}.mp3'
            try:
                verify_clip(destination)
                complete += 1
                print(f'{complete}/{len(texts)} existing {key}', flush=True)
                return
            except (ValueError, OSError):
                pass
            temporary = directory / f'.{key}.mp3.tmp'
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(temporary))
                    verify_clip(temporary)
                    os.replace(temporary, destination)
                    complete += 1
                    print(f'{complete}/{len(texts)} generated {key}', flush=True)
                    return
                except Exception as error:
                    temporary.unlink(missing_ok=True)
                    if 'CERTIFICATE_VERIFY_FAILED' in str(error) or '403' in str(error) or attempt == 3:
                        raise
                    await asyncio.sleep(2 ** (attempt + 1))
    await asyncio.gather(*(one(key, text) for key, text in texts.items()))
    write_json(directory / 'index.json', {'voice': VOICE, 'rate': RATE, 'files': sorted(texts), 'texts': texts})
    verify_all(texts)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--concurrency', type=int, default=3, choices=range(1, 9))
    arguments = parser.parse_args()
    sentences = expected_texts()
    if arguments.check:
        verify_all(sentences)
    else:
        asyncio.run(generate(sentences, arguments.concurrency))
