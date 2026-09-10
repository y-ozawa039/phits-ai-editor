; Tauri's standard file-association macro preserves the previous ProgID in a
; backup value, then restores it during uninstall. Remove only that temporary
; value after the original association has been restored.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHCTX "Software\Classes\.inp" "PHITS input file_backup"
  DeleteRegValue SHCTX "Software\Classes\.pht" "PHITS input file_backup"
!macroend
