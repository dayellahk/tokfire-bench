"""Build the public source download without internal reference datasets or binaries."""
from pathlib import Path
import hashlib
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = {'data', '.openai', 'research'}
INTERNAL = {'deploy/seed.mjs', 'scripts/import-omlx.py'}
ARCHIVES = ('.zip', '.dmg', '.apk', '.tar.gz', '.sha256')

def public_source(name):
    p = Path(name)
    return not (set(p.parts) & PRIVATE or name in INTERNAL or name.endswith(ARCHIVES)
                or any(part.startswith('.env') for part in p.parts))

def main():
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    archive = ROOT / 'public/tokfire-bench-source.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
        for name in sorted(files):
            if name and public_source(name) and (ROOT / name).is_file():
                out.write(ROOT / name, 'TokFireBench-0.9.0-source/' + name)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(checksum + '  ' + archive.name + '\n')
    print(f'Public source archive: {archive.stat().st_size} bytes; SHA256 {checksum}')

if __name__ == '__main__':
    main()
