# Setup Guide — First Time

Steps to go from "folder of starter files" to "working repo with Claude Code."

## 1. Install Node.js

Download and install from [nodejs.org](https://nodejs.org) (LTS version). Verify:

```bash
node --version   # should print v20.x or similar
npm --version    # should print 10.x or similar
```

## 2. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Verify: `claude --version`

## 3. Create the GitHub Repo

1. Go to [github.com/new](https://github.com/new)
2. Repository name suggestion: `epilepsy-data-uploader`
3. Set to **Private** (recommended — governance framework is pre-publication)
4. Do NOT initialize with README, .gitignore, or license (we have our own)
5. Click "Create repository"
6. Copy the "…or push an existing repository from the command line" URL

## 4. Create the Local Project

Open Terminal (Mac) or PowerShell (Windows):

```bash
# Go somewhere you keep projects
cd ~/Documents   # or wherever

# Create the project folder
mkdir epilepsy-data-uploader
cd epilepsy-data-uploader

# Copy the starter files (CLAUDE.md, README.md, .gitignore, docs/)
# from /Capstone Project/gui-project-starter/ into this folder
```

(On Windows, just drag the contents of `gui-project-starter` into your new folder in File Explorer.)

## 5. Initialize Git and Push

```bash
git init
git add .
git commit -m "Initial commit: starter docs and CLAUDE.md"

# Replace with your actual repo URL from step 3
git remote add origin https://github.com/YOUR_USERNAME/epilepsy-data-uploader.git
git branch -M main
git push -u origin main
```

## 6. Launch Claude Code in the Repo

```bash
# Still inside the epilepsy-data-uploader folder
claude
```

First run will prompt you to log in (browser-based auth with your Anthropic account).

Once logged in, Claude Code will auto-load `CLAUDE.md` and be ready to work on the project. Try:

```
Claude, read the docs folder and summarize what the project is.
```

If it gives you a reasonable summary, context is loaded correctly.

## 7. Scaffold the React App

In Claude Code, ask:

```
Scaffold a React + Vite + TypeScript project in this folder. Use Tailwind for styling. Set up the file structure described in CLAUDE.md.
```

Claude Code will run the scaffolding commands and commit the result.

## 8. First Real Feature

Start with the file drop zone — it's the entry point of the app and doesn't depend on the Pennsieve question.

```
Build a file drop zone component that accepts a folder. When a folder is dropped, scan its contents and show a flat list of every file with its relative path and size. Include a "pick folder" button as a fallback for browsers without drag-drop folder support.
```

---

## Troubleshooting

**`claude` command not found** — npm global bin isn't in your PATH. Either fix your PATH or use `npx @anthropic-ai/claude-code`.

**`git push` asks for password** — GitHub deprecated password auth. Use a Personal Access Token (github.com → Settings → Developer settings → Personal access tokens), or set up SSH keys.

**Claude Code doesn't seem to know about the project** — make sure `CLAUDE.md` is in the repo root (not in a subfolder). Run `claude` from the repo root.
