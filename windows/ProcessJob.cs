using System.ComponentModel;
using System.Runtime.InteropServices;
namespace TokFire.Bench;
// Close the job on cancellation/app exit to terminate only this benchmark's process tree.
internal sealed class ProcessJob:IDisposable {
 IntPtr handle;
 public ProcessJob(){handle=CreateJobObject(IntPtr.Zero,null);if(handle==IntPtr.Zero)throw new Win32Exception();var info=new Extended{Basic=new Basic{LimitFlags=0x2000}};var ptr=Marshal.AllocHGlobal(Marshal.SizeOf<Extended>());try{Marshal.StructureToPtr(info,ptr,false);if(!SetInformationJobObject(handle,9,ptr,(uint)Marshal.SizeOf<Extended>()))throw new Win32Exception();}catch{Dispose();throw;}finally{Marshal.FreeHGlobal(ptr);}}
 public void Assign(System.Diagnostics.Process process){if(!AssignProcessToJobObject(handle,process.Handle))throw new Win32Exception();}
 public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
 [StructLayout(LayoutKind.Sequential)]struct Basic{public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
 [StructLayout(LayoutKind.Sequential)]struct Io{public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
 [StructLayout(LayoutKind.Sequential)]struct Extended{public Basic Basic;public Io Io;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attrs,string? name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int infoClass,IntPtr info,uint length);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
}
