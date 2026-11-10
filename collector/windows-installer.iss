#ifndef CollectorVersion
  #error CollectorVersion is required
#endif
#ifndef CollectorSource
  #error CollectorSource is required
#endif
#ifndef CollectorOutput
  #error CollectorOutput is required
#endif

[Setup]
AppId={{A0E51746-ED76-4C22-8D3A-EA55EEAF99C2}
AppName=네오디오 수집기
AppVersion={#CollectorVersion}
AppPublisher=Neodio
DefaultDirName={localappdata}\Programs\Neodio Collector
DefaultGroupName=네오디오 수집기
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#CollectorOutput}
OutputBaseFilename=neodio-collector-win-x64-{#CollectorVersion}-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=네오디오 수집기

[Files]
Source: "{#CollectorSource}\*"; DestDir: "{tmp}\neodio-collector"; Flags: recursesubdirs createallsubdirs deleteafterinstall

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
  ProgramPath: String;
  AgentPath: String;
begin
  if CurStep <> ssPostInstall then Exit;
  ProgramPath := ExpandConstant('{tmp}\neodio-collector\neodio-collector.exe');
  AgentPath := ExpandConstant('{tmp}\neodio-collector\app\agent.mjs');
  if not Exec(ProgramPath, '"' + AgentPath + '" install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) then
    RaiseException('수집기 설치에 실패했습니다. %LOCALAPPDATA%\NeodioCollector\logs\agent.log를 확인하세요.');
end;

[UninstallRun]
Filename: "{localappdata}\NeodioCollector\runtime\neodio-collector.exe"; Parameters: """{localappdata}\NeodioCollector\runtime\app\agent.mjs"" uninstall"; Flags: runhidden; RunOnceId: "stop-collector"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\NeodioCollector\runtime"
