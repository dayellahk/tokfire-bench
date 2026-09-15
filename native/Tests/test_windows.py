import json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Sources/LocalAIBench/Resources'))
import platform_support as platform
import jobs_runner as runner
class WindowsTests(unittest.TestCase):
    def test_cim_output_has_only_approved_fields(self):
        fixture=dict(chip='AMD Ryzen 7',machine='Example PC',cpuCores=16,memoryBytes=32*1024**3,gpuNames=['NVIDIA GPU'],serial='secret')
        with patch.object(platform.os,'name','nt'),patch.object(platform.subprocess,'CREATE_NO_WINDOW',0x08000000,create=True),patch.object(platform.subprocess,'check_output',return_value=json.dumps(fixture)) as call,patch.object(platform.platform,'machine',return_value='AMD64'),patch.object(platform.platform,'version',return_value='10.0.26100'):
            result=platform.windows_hardware()
        self.assertEqual(set(result),{'platform','architecture','chip','machine','cpuCores','memoryBytes','osVersion','gpuNames'})
        self.assertEqual(result['architecture'],'x64')
        self.assertNotIn('SerialNumber',call.call_args.args[0][-1])
    def test_windows_cleanup_uses_process_termination(self):
        p=Mock();p.poll.return_value=None
        runner.PROCESSES.append(p)
        with patch.object(runner.os,'name','nt'):runner.stop_all()
        p.terminate.assert_called_once();p.wait.assert_called_once();self.assertEqual(runner.PROCESSES,[])
    def test_processes_stop_before_workspace_is_deleted(self):
        for fail in (False,True):
            seen=[]
            with patch.object(runner,'stop_all',side_effect=lambda:seen.append(Path(path).exists())):
                try:
                    with runner.workspace() as path:
                        if fail:raise ValueError('test')
                except ValueError:pass
            self.assertEqual(seen,[True]);self.assertFalse(Path(path).exists())
if __name__=='__main__':unittest.main()
