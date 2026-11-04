; electron-builder includes this before its own script, so the defines here reach its pages.
!include LogicLib.nsh
!include FileFunc.nsh

; Header, welcome and finish pages in the sky's black with the app's foreground (tokens.css --color-bg,
; --color-fg), beside the bitmaps from `npm run brand`. Classic check boxes: a themed one keeps black
; text whatever the colour (NSIS bug #443), which would hide "Launch Skymap".
!define MUI_BGCOLOR 000000
!define MUI_TEXTCOLOR E8EEFF
!define MUI_FORCECLASSICCONTROLS

!ifndef BUILD_UNINSTALLER
  ; The first sentence is APP_SUMMARY (src/control/shell/data/appSummary.ts); keep the two in step.
  !define MUI_WELCOMEPAGE_TITLE "Install Skymap"
  !define MUI_WELCOMEPAGE_TEXT "Skymap shows the universe as one 3D scene, built from star and galaxy catalogues.$\r$\n$\r$\nIt installs for everyone on this computer and lets tablets on a private network reach it. On its first start it downloads the sky's data once; after that it runs with no internet."
  !define MUI_FINISHPAGE_TITLE "Skymap is installed"
  !define MUI_FINISHPAGE_TEXT "Its first start opens the setup while the sky's data downloads."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Skymap"
!else
  ; The uninstaller opens on its choice: the app always goes, the sky's data only when ticked.
  !define removeDefaultUninstallWelcomePage
  !define UNINSTALL_SECTION_NAME "Skymap"
  !define MUI_PAGE_HEADER_TEXT "Uninstall Skymap"
  !define MUI_PAGE_HEADER_SUBTEXT "Choose what to remove."
  !define MUI_COMPONENTSPAGE_TEXT_TOP "Skymap, its shortcuts and its firewall rule are removed. The sky's data stays unless ticked, so a reinstall needs no new download."
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.describeSkyData
  !define MUI_FINISHPAGE_TITLE "Skymap is removed"
  !define MUI_FINISHPAGE_TEXT "Skymap, its shortcuts and its firewall rule are gone."
!endif

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Inbound rule so phones and tablets on a private or domain network can reach the app server.
; Public networks stay closed. The installer runs elevated (perMachine in electron-builder.yml).
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=in action=allow program="$INSTDIR\${PRODUCT_FILENAME}.exe" protocol=TCP localport=47823 profile=private,domain'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
!macroend

; The data is per user (Electron's userData), while this uninstaller runs per machine: the current
; user's AppData is the one the app filled. resolveDataRoot.ts names the same folder.
!macro skyDataDir OUT
  SetShellVarContext current
  StrCpy ${OUT} "$APPDATA\${PRODUCT_NAME}\data"
  SetShellVarContext all
!macroend

; Off by default; an update's silent uninstall never ticks it.
!macro customUnInstallSection
  Section /o "un.Downloaded sky data" skyData
    ${IfNot} ${isUpdated}
      !insertmacro skyDataDir $0
      RMDir /r "$0"
    ${EndIf}
  SectionEnd

  ; Names the data's size on its tick box, or where it is when the size can't be read; hides the
  ; box when there is no data.
  Function un.describeSkyData
    Push $0
    Push $1
    Push $2
    Push $3
    !insertmacro skyDataDir $0
    ${If} ${FileExists} "$0\*.*"
      ClearErrors
      ${GetSize} "$0" "/S=0M /G=1" $1 $2 $3
      ${If} ${Errors}
        SectionSetText ${skyData} "Downloaded sky data, in $0"
      ${ElseIf} $1 >= 1024
        IntOp $2 $1 / 1024
        IntOp $3 $1 % 1024
        IntOp $3 $3 * 10
        IntOp $3 $3 / 1024
        SectionSetText ${skyData} "Downloaded sky data, $2.$3 GB"
      ${Else}
        SectionSetText ${skyData} "Downloaded sky data, $1 MB"
      ${EndIf}
    ${Else}
      SectionSetText ${skyData} ""
    ${EndIf}
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd
!macroend
