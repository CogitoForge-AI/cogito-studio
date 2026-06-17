<p align="center">
    <img width="200" alt="Nexo Logo" src="https://raw.githubusercontent.com/Nexo-Agent/nexo/refs/heads/main/logo.svg">
</p>

<h1 align="center">Nexo - All-in-One Workspace AI</h1>

<div align="center">
  
  [![publish](https://github.com/Nexo-Agent/nexo/actions/workflows/build.yaml/badge.svg)](https://github.com/Nexo-Agent/nexo/actions/workflows/build.yaml)
  ![Vercel Deploy](https://deploy-badge.vercel.app/vercel/nexo-docs?style=flat-square&name=docs)
  ![Vercel Deploy](https://deploy-badge.vercel.app/vercel/nexo?style=flat-square&name=website)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

## About

Nexo is a cross-platform desktop AI assistant built with Tauri, React, and Rust. It provides a seamless interface for interacting with multiple LLM providers while offering advanced features like MCP (Model Context Protocol) integration, workspace management, and extensible tool support.

## Key Advantages:

- **True Freedom**: Use any LLM provider with your own API keys - no vendor lock-in
- **Privacy-Focused**: All conversations stored locally in SQLite, no data sent to third parties
- **Extensible**: MCP protocol support + Python/Node runtime for unlimited tool possibilities
- **Customizable**: Full control over system prompts, workspace settings, and UI preferences
- **Cost-Effective**: Pay only for LLM API usage, no subscription fees
- **Community-Driven**: Open source with active development and community contributions

## Installation

### Quick install (macOS + Linux)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Nexo-Agent/nexo/main/installer.sh)
```

You can pin a version by setting `VERSION`, for example:

```bash
VERSION=0.1.0-beta.21 bash <(curl -fsSL https://raw.githubusercontent.com/Nexo-Agent/nexo/main/installer.sh)
```

### Quick install (Windows 10+)

Run in PowerShell:

```powershell
& ([ScriptBlock]::Create((iwr -useb https://raw.githubusercontent.com/Nexo-Agent/nexo/main/installer-windows.ps1)))
```

Pin a version:

```powershell
& ([ScriptBlock]::Create((iwr -useb https://raw.githubusercontent.com/Nexo-Agent/nexo/main/installer-windows.ps1))) -Version "0.1.0-beta.21"
```

Silent install (run PowerShell as Administrator):

```powershell
& ([ScriptBlock]::Create((iwr -useb https://raw.githubusercontent.com/Nexo-Agent/nexo/main/installer-windows.ps1))) -Silent
```

### MacOS Via Homebrew

```bash
brew tap nexo-agent/nexo
brew install --cask nexo
```

### Windows

Download the latest release for your platform from the [Releases](https://github.com/Nexo-Agent/nexo/releases) page and run the `.msi` or `.exe` installer

### Linux

Download the latest release for your platform from the [Releases](https://github.com/Nexo-Agent/nexo/releases) page and run the `.deb` or `.AppImage` file

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Nexo-Agent/nexo&type=timeline&legend=top-left)](https://www.star-history.com/#Nexo-Agent/nexo&type=timeline&legend=top-left)

<div align="center">
  <p>Made with ❤️ by the Nexo community</p>
  <p>
    <a href="https://github.com/Nexo-Agent/nexo/stargazers">⭐ Star us on GitHub</a> •
    <a href="https://nexo.nkthanh.dev">🌐 Visit Website</a>
  </p>
</div>
