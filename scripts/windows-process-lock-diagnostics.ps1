param([Parameter(Mandatory=$true)][ValidateSet('Inspect')][string]$Mode,[Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
$Target=[IO.Path]::GetFullPath($Target)
if(-not ('OpenFrontRestartManager' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
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
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int RmStartSession(out uint h,int flags,StringBuilder key);
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int RmRegisterResources(uint h,uint nf,string[] files,uint na,UniqueProcess[] apps,uint ns,string[] services);
 [DllImport("rstrtmgr.dll",ExactSpelling=true)] static extern int RmGetList(uint h,out uint needed,ref uint count,IntPtr affected,ref uint reasons);
 [DllImport("rstrtmgr.dll",ExactSpelling=true)] static extern int RmEndSession(uint h);
 public static ProcessInfo[] GetLockers(string[] files) {
  uint session; var sessionKey=new StringBuilder(33); int rc=RmStartSession(out session,0,sessionKey);
  if(rc!=0) throw new InvalidOperationException("RmStartSession failed: "+rc);
  try {
   for(int offset=0;offset<files.Length;offset+=1000) {
    int length=Math.Min(1000,files.Length-offset); string[] batch=new string[length]; Array.Copy(files,offset,batch,0,length);
    rc=RmRegisterResources(session,(uint)batch.Length,batch,0,null,0,null);
    if(rc!=0) throw new InvalidOperationException("RmRegisterResources failed at offset "+offset+": "+rc);
   }
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
$result = @(
    foreach ($owner in $owners) {
        $pidValue = [int]$owner.Process.ProcessId
        $proc = $processSnapshot[$pidValue]
        $image = if ($proc) { [string]$proc.ExecutablePath } else { '' }
        $command = if ($proc) { [string]$proc.CommandLine } else { '' }
        $parentId = if ($proc) { [int]$proc.ParentProcessId } else { 0 }
        $parent = if ($parentId -gt 0) { $processSnapshot[$parentId] } else { $null }
        $parentImage = if ($parent) { [string]$parent.ExecutablePath } else { '' }
        $parentCommand = if ($parent) { [string]$parent.CommandLine } else { '' }
        $category = 'external-or-unclassified'

        if ($image -match '(?i)(^|\\)(setup|uninstall|installer)[^\\]*\.exe$' -or $command -match '(?i)(setup|uninstall|installer)[^\\]*\.exe') {
            $category = 'installer-or-uninstaller'
        }
        elseif ($command -match '(?i)windows-update-rollback\.ps1|windows-process-lock-diagnostics\.ps1') {
            $category = 'updater-helper'
        }
        elseif ($command -match '(?i)--type=renderer') {
            $category = 'electron-renderer'
        }
        elseif ($command -match '(?i)--type=(utility|gpu-process|crashpad-handler|zygote)') {
            $category = 'electron-child-process'
        }
        elseif ($image -match '(?i)\\OpenFront Replay Coach\.exe$' -or $command -match '(?i)electron.*OpenFront Replay Coach') {
            $category = 'electron-main-process'
        }
        elseif (($image -and $image.StartsWith($Target.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) -or
                ($command -match '(?i)OpenFront Replay Coach' -and $command -notmatch '(?i)--type=renderer')) {
            $category = 'application-helper'
        }
        elseif ($parentImage -match '(?i)\\OpenFront Replay Coach\.exe$' -or $parentCommand -match '(?i)OpenFront Replay Coach') {
            $category = 'application-child-process'
        }

        [pscustomobject]@{
            processId = $pidValue
            processName = [string]$owner.AppName
            executablePath = $image
            commandLine = $command
            parentProcessId = if ($proc) { [int]$proc.ParentProcessId } else { $null }
            parentExecutablePath = $parentImage
            applicationType = [string]$owner.ApplicationType
            category = $category
            sessionId = [int]$owner.SessionId
        }
    }
)

ConvertTo-Json -InputObject @($result) -Depth 5 -Compress
