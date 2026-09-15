"""Windows hardware fields for benchmark reports. No host/user/serial identifiers."""
import json, os, platform, subprocess

def windows_hardware():
    if os.name != 'nt': raise ValueError('Windows hardware detection requires Windows.')
    script = """$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;
    $cpu=Get-CimInstance Win32_Processor; $pc=Get-CimInstance Win32_ComputerSystem;
    $gpu=@(Get-CimInstance Win32_VideoController | ForEach-Object {$_.Name});
    @{chip=(@($cpu)[0].Name); machine=($pc.Manufacturer+' '+$pc.Model); cpuCores=[int]$pc.NumberOfLogicalProcessors; memoryBytes=[long]$pc.TotalPhysicalMemory; gpuNames=$gpu} | ConvertTo-Json -Compress"""
    try:
        raw=subprocess.check_output(['powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-Command',script],timeout=30,encoding='utf-8-sig',stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
        data=json.loads(raw)
    except (OSError,subprocess.SubprocessError,ValueError):
        raise ValueError('Could not inspect Windows hardware using CIM. Check that Windows Management Instrumentation is running.') from None
    def clean(value,limit):return ''.join(c for c in str(value) if c.isprintable()).strip()[:limit]
    return {'platform':'Windows','architecture':'arm64' if platform.machine().lower() in ('arm64','aarch64') else 'x64',
            'chip':clean(data['chip'],160),'machine':clean(data['machine'],160),
            'cpuCores':int(data['cpuCores']),'memoryBytes':int(data['memoryBytes']),
            'osVersion':platform.version(),'gpuNames':[clean(x,160) for x in data.get('gpuNames',[])][:8]}

if __name__=='__main__':print(json.dumps(windows_hardware(),ensure_ascii=True))
