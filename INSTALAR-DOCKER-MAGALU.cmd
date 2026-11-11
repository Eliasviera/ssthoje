@echo off
chcp 65001 >nul
title SST Hoje - instalar Docker na VM (Magalu Cloud)
echo.
echo  ============================================================
echo   SST Hoje - preparar a VM da Magalu Cloud (177.93.129.60)
echo  ============================================================
echo.
echo  Este passo instala o Docker na VM. E o unico que precisa de
echo  administrador; depois dele o resto e automatico.
echo.
echo  Se pedir confirmacao de host, digite: yes
echo.

ssh -t -i "%USERPROFILE%\.ssh\sst-hoje-magalu" -o StrictHostKeyChecking=accept-new ubuntu@177.93.129.60 "sudo bash ~/sst-hoje/install-docker.sh"

echo.
echo  ------------------------------------------------------------
echo   Se apareceu PROVISION_OK acima, deu certo.
echo   Volte ao chat e diga: docker instalado
echo  ------------------------------------------------------------
echo.
pause
