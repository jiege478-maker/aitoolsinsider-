@echo off
chcp 65001 >nul
echo ============================================
echo   AI Tools Insider - Publish Only
echo   更新 index.html + sitemap.xml
echo ============================================
echo.
node publish-only.js
echo.
if %ERRORLEVEL% EQU 0 (
  echo 操作成功完成！
) else (
  echo 发生错误，请检查上方输出。
)
echo.
pause
