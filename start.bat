@echo off
echo ========================================
echo   DTF Print Portal - T-Shirt Designer
echo ========================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo Dependencies not found. Installing...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Make sure Node.js is installed.
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully.
    echo.
)

echo Starting development server...
echo.
echo App will open at: http://localhost:5173
echo Press Ctrl+C to stop the server
echo.
call npx vite --open
