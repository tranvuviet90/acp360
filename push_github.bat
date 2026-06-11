@echo off
color 0A
echo =================================================================
echo Dang tien hanh add, commit va push code acp360 len GitHub...
echo =================================================================
git add .
git commit -m "feat: use Vite environment variables, refactor lazy loading, add ErrorBoundary, and chatbot markdown support"
git push
echo =================================================================
echo Hoan thanh push code acp360 len GitHub!
echo =================================================================
pause
