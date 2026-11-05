# How to make a change

Every change reaches `main` through a pull request (PR).
Nobody pushes to `main`.
This page gives the exact commands, so you do not need to know git well.
Run every command from the project folder.

## 1. Take an issue

Open the issue on GitHub and assign it to yourself (Assignees, then your name).
Then the team knows you are working on it, and nobody else starts it.
If no issue exists for your work, make one first.

## 2. Start a branch from the newest main

```bash
git switch main
git pull
git switch -c feat/short-name
```

Use `feat/` for a new feature, `fix/` for a bug fix, and `docs/` for docs only.
Use `ui/` only when you change files in `ui/` and nothing else.

## 3. Save your work

```bash
git status
git add path/to/file another/file
git commit -m "feat: what the change does"
```

`git status` lists what changed.
Add only the files you meant to change.
Do not use `git add .` or `git add -A` unless `git status` shows only your files.

Never commit these:

- Files that a script makes, such as `api/data/`, a vector store, or a build folder.
- Large data files. Raw data stays outside the repo, and `docs/data-sources.md` says where.
- Keys, passwords, and `.env` files.

Anything in `datasets/` stays on your laptop, because git ignores that folder.

## 4. Push the branch and open a PR

```bash
git push -u origin feat/short-name
```

The push prints a link.
Open it, fill in the PR template, and write "Closes #N" for the issue.
Ask one teammate to review it.
The reviewer merges it, not you.

## 5. Keep your branch up to date

When `main` changes while you work, bring those changes into your branch:

```bash
git switch feat/short-name
git pull origin main
```

## 6. If git says "merge conflict"

Stop, and do not guess.
Run `git status` and send the output to the team channel.
To go back to where you were before the pull, run `git merge --abort`.
A teammate can help you keep both sides of the change.

## 7. If you committed on main by mistake

The pre-push hook refuses the push, so nothing reached GitHub.
Move the commits to a branch:

```bash
git switch -c feat/short-name
git branch -f main origin/main
git push -u origin feat/short-name
```

Then open the PR as in step 4.

## The pre-push hook

`make setup` turns on `.githooks/pre-push`, which refuses any push to `main`.
In a clone made before the hook existed, run `make hooks` once.
On GitHub, the `main-guard` check puts a red X on any commit that reaches `main` without a PR.
