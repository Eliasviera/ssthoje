@echo off
title SST Hoje - gerar pacote para AWS
cd /d "%~dp0"
echo ============================================
echo  SST Hoje - atualizacao local para a AWS
echo ============================================
echo.
node scripts\release-eb.mjs
if errorlevel 1 (
  echo.
  echo *** FALHOU. O pacote anterior foi mantido. ***
) else (
  echo.
  echo *** Pacote pronto: examples\sst-hoje-eb.zip ***
)
echo.
pause
