@echo off
setlocal
rem 真正值得买频道 -> 企业微信群机器人 每日抓取
rem 请先在环境变量里设置 ZZZDM_WEBHOOK_KEY，或取消下面一行的注释并填入自己的 key。
rem set "KEY=你的企业微信机器人 key"
if defined ZZZDM_WEBHOOK_KEY set "KEY=%ZZZDM_WEBHOOK_KEY%"
if not defined KEY (
    echo 错误：未设置 ZZZDM_WEBHOOK_KEY 环境变量，也未在本脚本中填写 KEY。
    exit /b 1
)

set "PY=python"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"

rem 默认发当天全部；可加参数如 --latest 10 只发最新10条
"%PY%" "%~dp0tg_zzzdm_to_wecom.py" -k "%KEY%" %*
endlocal
