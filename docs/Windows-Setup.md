# Windows Setup

Use Git Bash to run the repository's Makefile. The Makefile detects Windows and uses the Windows virtual-environment paths.

## Prerequisites

- Git for Windows, including Git Bash
- Python 3
- WinGet (included with current Windows App Installer)

GNU Make and Node.js LTS with npm are installed by the PowerShell scripts below. `uv` is optional; `make setup` attempts to install it and uses pip if that fails.

## Install Make and npm

Open PowerShell in the project folder and run:

```powershell
.\scripts\install-make.ps1
.\scripts\install-nodejs.ps1
```

The scripts install GNU Make and Node.js LTS (which includes npm) with WinGet and add their locations to your user `PATH`. Close PowerShell and any open Git Bash windows after installation so new terminals receive the updated `PATH`.

## Set up and run the demo

Open Git Bash in the project folder. Check the tools are available:

```bash
git --version
python --version
make --version
node --version
npm --version
```

With network access available for the first setup, install dependencies and prepare the local index:

```bash
make setup
```

Start the local demo:

```bash
make demo
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser to use the app. Press `Ctrl+C` in Git Bash to stop the server.
