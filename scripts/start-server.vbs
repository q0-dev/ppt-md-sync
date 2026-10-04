' Start the local dev server in the background (double-click; no window).
' For auto-start: put this file in the Windows Startup folder (shell:startup).
' Finds node.exe in common install locations, then falls back to node on PATH.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
nodeCmd = "node"
For Each candidate In Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
  sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"), _
  "D:\Program Files\nodejs\node.exe")
  If fso.FileExists(candidate) Then
    nodeCmd = Chr(34) & candidate & Chr(34)
    Exit For
  End If
Next
q = Chr(34)
sh.Run nodeCmd & " " & q & projectDir & "\scripts\serve.mjs" & q, 0, False
