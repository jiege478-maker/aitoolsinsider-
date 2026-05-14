@echo off
echo ========================================
echo   Manual Article Publisher
echo ========================================
echo.
echo Usage: Place articles.json in this folder,
echo then run this script.
echo.
cd /d "%~dp0"
node publish-articles.js --input articles.json --deploy
pause
