from pathlib import Path
import hashlib,tarfile,sys
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'dist/TokFireBench-0.9.0-cli.tar.gz'
out.parent.mkdir(parents=True,exist_ok=True)
with tarfile.open(out,'w:gz') as archive:
 for p in sorted((root/'native/Sources/LocalAIBench/Resources').glob('*.py')):
  archive.add(p,arcname='TokFireBench-0.9.0-cli/'+p.name)
 for p in [root/'cli/README.md',root/'native/Sources/LocalAIBench/Resources/advanced_parameters.json',root/'native/Sources/LocalAIBench/Resources/lemon-squeezy.json']:
  archive.add(p,arcname='TokFireBench-0.9.0-cli/'+p.name)
out.with_name(out.name+'.sha256').write_text(hashlib.sha256(out.read_bytes()).hexdigest()+'  '+out.name+'\n')
print(out)
