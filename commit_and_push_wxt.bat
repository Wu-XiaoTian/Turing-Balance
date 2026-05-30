@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

where git >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 git 命令，请先安装并配置 Git 到 PATH。
    popd >nul
    exit /b 1
)

set "INIT_REPO=0"
for /f "delims=" %%I in ('git rev-parse --show-toplevel 2^>nul') do set "REPO_ROOT=%%I"

if not defined REPO_ROOT (
    echo [提示] 当前目录不在 Git 仓库中，正在初始化本地仓库...
    git init
    if errorlevel 1 goto :error
    set "INIT_REPO=1"
    for /f "delims=" %%I in ('cd') do set "REPO_ROOT=%%I"
)

cd /d "%REPO_ROOT%"

set "TARGET_PREFIX=."
if "%INIT_REPO%"=="0" (
    pushd "%SCRIPT_DIR%" >nul
    for /f "delims=" %%I in ('git rev-parse --show-prefix 2^>nul') do set "TARGET_PREFIX=%%I"
    popd >nul
    if not defined TARGET_PREFIX set "TARGET_PREFIX=."
)

set "TARGET_PREFIX_CLEAN=%TARGET_PREFIX%"
if not "%TARGET_PREFIX_CLEAN%"=="." (
    if "%TARGET_PREFIX_CLEAN:~-1%"=="/" set "TARGET_PREFIX_CLEAN=%TARGET_PREFIX_CLEAN:~0,-1%"
)

set "BRANCH=wxt_dev"
set "GITHUB_URL=https://github.com/Wu-XiaoTian/Turing-Balance"
set "COMMIT_MSG=%~1"

if not defined COMMIT_MSG (
    set /p COMMIT_MSG=请输入提交信息: 
)

if not defined COMMIT_MSG (
    set "COMMIT_MSG=auto commit"
)

set "HAS_HEAD=1"
git rev-parse --verify HEAD >nul 2>nul
if errorlevel 1 set "HAS_HEAD=0"

echo [1/5] 清理暂存区缓存...
if "%HAS_HEAD%"=="1" (
    git reset --quiet HEAD -- .
    if errorlevel 1 goto :error
)

echo [2/5] 暂存目标目录变更...
if "%TARGET_PREFIX%"=="." (
    git add -A -- .
) else (
    git add -A -- "%TARGET_PREFIX%"
)
if errorlevel 1 goto :error

if not "%TARGET_PREFIX_CLEAN%"=="." (
    set "OUT_OF_SCOPE=0"
    for /f "delims=" %%I in ('git diff --cached --name-only --') do (
        echo %%I | findstr /i /b /c:"%TARGET_PREFIX_CLEAN%/" >nul
        if errorlevel 1 (
            set "OUT_OF_SCOPE=1"
            echo [错误] 暂存区包含目标目录外文件: %%I
        )
    )
    if "!OUT_OF_SCOPE!"=="1" goto :error
)

echo [3/5] 从暂存区移除所有 output 目录内容...
for /f "delims=" %%I in ('git diff --cached --name-only --') do (
    echo %%I | findstr /i /c:"/output/" >nul
    if not errorlevel 1 (
        if "%HAS_HEAD%"=="1" (
            git reset --quiet HEAD -- "%%I"
        ) else (
            git rm --cached -q -- "%%I" 2>nul
        )
    )
)

set "OUTPUT_LEFT=0"
for /f "delims=" %%I in ('git diff --cached --name-only --') do (
    echo %%I | findstr /i /c:"/output/" >nul
    if not errorlevel 1 (
        set "OUTPUT_LEFT=1"
        echo [错误] 暂存区仍包含 output 目录内容: %%I
    )
)
if "!OUTPUT_LEFT!"=="1" goto :error

if "%TARGET_PREFIX%"=="." (
    git diff --cached --quiet -- .
) else (
    git diff --cached --quiet -- "%TARGET_PREFIX%"
)
set "DIFF_STATUS=%errorlevel%"
if "%DIFF_STATUS%"=="0" (
    echo [4/5] 没有新的暂存变更，跳过提交。
) else if "%DIFF_STATUS%"=="1" (
    echo [4/5] 创建提交...
    git commit -m "%COMMIT_MSG%"
    if errorlevel 1 goto :error
) else (
    goto :error
)

echo [5/5] 配置并强制推送到 GitHub 的 %BRANCH% 分支...
git remote get-url github >nul 2>nul
if errorlevel 1 (
    git remote add github "%GITHUB_URL%"
) else (
    git remote set-url github "%GITHUB_URL%"
)
if errorlevel 1 goto :error

git push --force github HEAD:refs/heads/%BRANCH%
if errorlevel 1 goto :error

echo [完成] 已提交并同步到 GitHub 的 %BRANCH% 分支。
popd >nul
exit /b 0

:error
echo [错误] 提交或推送失败，请根据上方最后一条错误信息排查。
popd >nul
exit /b 1
