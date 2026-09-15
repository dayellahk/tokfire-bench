"""Opt-in real Mac GUI lifecycle test; uses the app’s visible upload setting."""
import json, pathlib, subprocess, time, os
root=pathlib.Path(__file__).resolve().parents[1]
app=root/'build/TokFire Bench.app/Contents/MacOS/LocalAIBench'
model=pathlib.Path.home()/'Library/Application Support/LocalAIBench/Models/MiniCPM5-2B-Q4_K_M.gguf'
engine=os.environ.get('LOCALAI_ENGINE','llama')
folder=root/('build/v0.5-lifecycle-'+engine)
count=int(os.environ.get('LOCALAI_JOBS','3'))
for mode in os.environ.get('LOCALAI_MODES','stop,quit,complete').split(','):
    capture=folder/mode
    capture.mkdir(parents=True,exist_ok=True)
    (capture/"state.json").unlink(missing_ok=True)
    flags=['--run-model',str(model),'--capture-directory',str(capture)]
    if engine=='omlx': flags=['--run-mlx',str(pathlib.Path.home()/'.omlx/models/stamsam/Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-MLX-oQ4-MTP'),'--capture-directory',str(capture)]
    flags += ['--jobs',str(count)]
    if mode=='stop': flags+=['--stop-on-measurement']
    if mode=='quit': flags+=['--quit-on-measurement']
    proc=subprocess.Popen([str(app),*flags],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    descendants=set()
    try:
        deadline=time.monotonic()+300
        result=None
        while time.monotonic()<deadline:
            for line in subprocess.check_output(['ps','-axo','pid=,ppid=,command='],text=True).splitlines():
                fields=line.strip().split(None,2)
                if len(fields)==3 and (int(fields[1])==proc.pid or int(fields[1]) in descendants): descendants.add(int(fields[0]))
            state=capture/'state.json'
            if state.exists():
                result=json.loads(state.read_text())
                if mode=='stop' and result['phase']=='已停止' and not result['running']:
                    assert result['report']=='',result
                    break
                if mode=='complete' and result['phase']=='測試完成' and not result['running']:
                    assert result['completedSamples']==count*3,result
                    report=json.loads(pathlib.Path(result['report']).read_text())
                    assert len(report['models'][0]['samples'])==count*3
                    break
            if proc.poll() is not None:
                assert mode=='quit' and proc.returncode==0, (mode,proc.returncode,result)
                break
            time.sleep(.15)
        else: raise AssertionError((mode,'GUI lifecycle timed out',result))
        alive=set(int(x) for x in subprocess.check_output(['ps','-axo','pid='],text=True).split())
        assert not descendants.intersection(alive),('orphaned process',descendants.intersection(alive))
        print(mode,'PASS',result,flush=True)
    finally:
        if proc.poll() is None:
            proc.terminate(); proc.wait(timeout=15)
