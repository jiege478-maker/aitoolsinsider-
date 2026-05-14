@echo off
set DEEPSEEK_API_KEY=sk-d6548cb60b21431d8560a59bcbc2d013
echo Generating 5 E-E-A-T enhanced articles...
node generate-articles-workflow.js --no-deploy
echo Done!
pause