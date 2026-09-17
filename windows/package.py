"""Package a previously published Windows x64 build; never include local settings/keys."""
from pathlib import Path
import hashlib,json,shutil,sys,zipfile
root=Path(__file__).resolve().parents[1]
build=root/'windows/publish/win-x64'
assert (build/'TokFire Bench.exe').read_bytes()[:2]==b'MZ','Publish Windows build first'
nuget=Path.home()/'.nuget/packages'
notices=build/'licenses';notices.mkdir(exist_ok=True)
libraries=json.loads((build/'TokFire Bench.deps.json').read_text())['libraries']
for package,names in [('microsoft.netcore.app.runtime.win-x64',['LICENSE.TXT','THIRD-PARTY-NOTICES.TXT']),('microsoft.windowsdesktop.app.runtime.win-x64',['LICENSE']),('microsoft.web.webview2',['LICENSE.txt','NOTICE.txt'])]:
    folder=next(k.lower().removeprefix('runtimepack.') for k in libraries if k.lower().removeprefix('runtimepack.').split('/')[0]==package)
    for name in names:shutil.copyfile(nuget/folder/name,notices/(folder.split('/')[0]+'-'+name))
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'public/TokFireBench-0.9.0-windows-x64.zip'
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(build.rglob('*')):
        if p.is_file() and p.suffix not in ('.pdb','.pyc') and '__pycache__' not in p.parts:z.write(p,Path('TokFireBench-0.9.0')/p.relative_to(build))
# Reopen only after the central directory and buffered writes are finalized.
with zipfile.ZipFile(out,'r') as z:
    bad=z.testzip()
    assert bad is None,f'ZIP integrity failure: {bad}'
checksum=hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.zip.sha256').write_text(checksum+'  '+out.name+'\n')
print(f'{out.name}: {out.stat().st_size/1024**2:.1f} MiB; SHA256 {checksum}')
