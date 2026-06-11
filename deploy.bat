@echo off
color 0B
echo =================================================================
echo Dang tien hanh build va deploy acp360 len Firebase Hosting...
echo =================================================================
call npm run build
call firebase deploy --only firestore:rules,hosting
echo =================================================================
echo Hoan thanh build va deploy acp360 len Firebase!
echo =================================================================
pause
