Unicode true
SetCompressor zlib
SetDateSave off
CRCCheck force

!include "LogicLib.nsh"
!include "payload.nsh"

Name "MarketWeft"
OutFile "marketweft-desktop-x64.exe"
Icon "icon.ico"
InstallDir "$LOCALAPPDATA\MarketWeft"
RequestExecutionLevel user
VIProductVersion "${MARKETWEFT_VERSION}.0"
VIAddVersionKey "CompanyName" "MarketWeft contributors"
VIAddVersionKey "ProductName" "MarketWeft"
VIAddVersionKey "FileDescription" "MarketWeft desktop installer"
VIAddVersionKey "ProductVersion" "${MARKETWEFT_VERSION}"
VIAddVersionKey "FileVersion" "${MARKETWEFT_VERSION}"
VIAddVersionKey "LegalCopyright" "MarketWeft contributors"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MarketWeft"
!define WEBVIEW2_KEY "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Function .onInit
  SetShellVarContext current
  ReadRegStr $0 HKCU "${WEBVIEW2_KEY}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKLM "${WEBVIEW2_KEY}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Install the Microsoft WebView2 Runtime before installing MarketWeft." /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
FunctionEnd

Section "MarketWeft"
  !insertmacro InstallPayload
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$SMPROGRAMS\MarketWeft.lnk" "$INSTDIR\marketweft-desktop.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "MarketWeft"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${MARKETWEFT_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetOutPath "$TEMP"
  !insertmacro RemovePayload
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$SMPROGRAMS\MarketWeft.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  RMDir "$INSTDIR"
SectionEnd
