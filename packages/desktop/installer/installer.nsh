; Inbound rule so phones and tablets on a private or domain network can reach the app server.
; Public networks stay closed. The installer runs elevated (perMachine in electron-builder.yml).
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Skymap" dir=in action=allow program="$INSTDIR\Skymap.exe" protocol=TCP localport=47823 profile=private,domain'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Skymap"'
!macroend
