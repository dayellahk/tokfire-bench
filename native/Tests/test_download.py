import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('trial', Path(__file__).parents[1] / 'trial-minicpm.py')
trial = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(trial)

class DownloadTests(unittest.TestCase):
    def test_checksum_verified_before_install_and_reused_without_network(self):
        data = b'GGUFsynthetic download fixture'
        with tempfile.TemporaryDirectory() as folder, patch.object(trial, 'SHA256', hashlib.sha256(data).hexdigest()):
            target = Path(folder) / 'model.gguf'
            with patch.object(trial.urllib.request, 'urlopen', return_value=io.BytesIO(data)) as request:
                trial.ensure_model(target)
                trial.ensure_model(target)
                request.assert_called_once()
            self.assertEqual(target.read_bytes(), data)
            self.assertEqual([p.name for p in Path(folder).iterdir()], ['model.gguf'])

    def test_corrupt_download_removed_and_existing_file_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'model.gguf'
            with patch.object(trial.urllib.request, 'urlopen', return_value=io.BytesIO(b'corrupt')):
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    trial.ensure_model(target)
            self.assertEqual(list(Path(folder).iterdir()), [])
            target.write_bytes(b'existing file')
            with patch.object(trial.urllib.request, 'urlopen') as request:
                with self.assertRaisesRegex(ValueError, 'Existing model checksum'):
                    trial.ensure_model(target)
                request.assert_not_called()
            self.assertEqual(target.read_bytes(), b'existing file')

    def test_unsupported_host_fails_before_network_or_process_launch(self):
        with patch.object(trial.sys, 'argv', ['trial-minicpm.py']), patch.object(trial.runner.platform, 'system', return_value='Linux'), patch.object(trial, 'ensure_model') as download, patch.object(trial.subprocess, 'run') as process:
            with self.assertRaisesRegex(ValueError, 'Apple Silicon'):
                trial.main()
            download.assert_not_called()
            process.assert_not_called()

if __name__ == '__main__':
    unittest.main()
