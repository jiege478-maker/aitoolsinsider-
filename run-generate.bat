@echo off
echo AI Tools Insider - Article Generator
echo ====================================
echo.
set DEEPSEEK_API_KEY=sk-d6548cb60b21431d8560a59bcbc2d013
node generate-articles-workflow.js --no-deploy
echo.
pause
