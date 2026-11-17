param([Parameter(Mandatory=$true)][ValidateSet('Inspect')][string]$Mode,[Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
$Target=[IO.Path]::GetFullPath($Target)
if(-not ('OpenFrontRestartManager' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OpenFrontRestartManager {
 [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public int ProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME StartTime; }
 public enum AppType { Unknown=0, MainWindow=1, OtherWindow=2, Service=3, Explorer=4, Console=5, Critical=1000 }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct ProcessInfo {
  public UniqueProcess Process;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)] public string AppName;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)] public string ServiceName;
  public AppType ApplicationType; public uint AppStatus; public uint SessionId;
  [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
 }
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint h,int flags,string key);
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint h,uint nf,string[] files,uint na,UniqueProcess[] apps,uint ns,string[] services);
 [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h,out uint needed,ref uint count,IntPtr affected,ref uint reasons);
 [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
 public static ProcessInfo[] GetLockers(string[] files) {
  uint session; int rc=RmStartSession(out session,0,Guid.NewGuid().ToString("N"));
  if(rc!=0) throw new InvalidOperationException("RmStartSession failed: "+rc);
  try {
   rc=RmRegisterResources(session,(uint)files.Length,files,0,null,0,null);
   if(rc!=0) throw new InvalidOperationException("RmRegisterResources failed: "+rc);
   uint needed=0,count=0,reasons=0; rc=RmGetList(session,out needed,ref count,IntPtr.Zero,ref reasons);
   if(rc==0 || needed==0) return new ProcessInfo[0];
   if(rc!=234) throw new InvalidOperationException("RmGetList sizing failed: "+rc);
   count=needed; int size=Marshal.SizeOf(typeof(ProcessInfo)); IntPtr buffer=Marshal.AllocHGlobal(size*(int)count);
   try {
    rc=RmGetList(session,out needed,ref count,buffer,ref reasons);
    if(rc!=0) throw new InvalidOperationException("RmGetList failed: "+rc);
    var output=new ProcessInfo[count];
    for(int i=0;i<count;i++) output[i]=(ProcessInfo)Marshal.PtrToStructure(IntPtr.Add(buffer,i*size),typeof(ProcessInfo));
    return output;
   } finally { Marshal.FreeHGlobal(buffer); }
  } finally { RmEndSession(session); }
 }
}
'@
}
$files=@(Get-ChildItem -LiteralPath $Target -File -Force -Recurse -ErrorAction Stop | ForEach-Object FullName)
if($files.Count -eq 0){Write-Output '[]';exit 0}
$owners=[OpenFrontRestartManager]::GetLockers([string[]]$files)
$processSnapshot=@{}
Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { $processSnapshot[[int]$_.ProcessId]=$_ }
$result=@(foreach($owner in $owners){
 $pidValue=[int]$owner.Process.ProcessId; $proc=$processSnapshot[$pidValue]
 $image=if($proc){[string]$proc.ExecutablePath}else{''}; $command=if($proc){[string]$proc.CommandLine}else{''}
 $category='external-or-unclassified'
 if($image -and $image.StartsWith($Target.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){$category='application-process'}
 elseif($image -match '(?i)(setup|uninstall|update|elevat|squirrel|electron)'){$category='installer-updater-or-helper'}
 elseif($command -match '(?i)OpenFront Replay Coach'){$category='application-helper'}
 [pscustomobject]@{processId=$pidValue;processName=[string]$owner.AppName;executablePath=$image;commandLine=$command;parentProcessId=if($proc){[int]$proc.ParentProcessId}else{$null};applicationType=[string]$owner.ApplicationType;category=$category;sessionId=[int]$owner.SessionId}
})
ConvertTo-Json -InputObject @($result) -Depth 5 -Compress
