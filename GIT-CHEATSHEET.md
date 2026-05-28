# Git Cheat Sheet

A practical git reference oriented around this repo's workflow (solo dev,
`origin` = your GitHub, `main` branch).

## Mental model

Your work moves through four places:

```
Working tree → Staging area → Local repo → Remote (GitHub)
  (edits)        (git add)      (git commit)   (git push)
```

`pull` brings the remote's commits back down the other way.

---

## Checking what's going on (safe, read-only)

```bash
git status              # what's changed / staged / untracked — run this constantly
git status -sb          # short version + ahead/behind remote
git diff                # unstaged changes (what you haven't `add`ed yet)
git diff --staged       # changes you've staged but not committed
git log --oneline -10   # last 10 commits, one line each
git log --oneline --graph --all   # visual branch/commit tree
git show <commit>       # full details + diff of one commit
```

## Staging & committing

```bash
git add file.js              # stage one file
git add app/                 # stage a folder
git add -A                   # stage everything (new, modified, deleted)
git restore --staged file.js # unstage (keep the edit)

git commit -m "Message"      # commit staged changes
git commit -am "Message"     # stage tracked-file changes AND commit (skips new files)
```

Good messages: imperative mood, ~50 chars — *"Add sync settings panel"*, not
*"added stuff"*.

## Syncing with GitHub

```bash
git pull                 # fetch remote commits + merge into your branch (do this before you start)
git push                 # upload your commits to GitHub
git push origin main     # explicit form (branch = main, remote = origin)
git fetch                # download remote changes WITHOUT merging (just look)
git clone <url>          # copy a repo onto a new machine (e.g. your desktop)
git remote -v            # show where origin points
```

## Branches (for trying things without touching `main`)

```bash
git branch                   # list branches; * marks current
git switch -c feature-x      # create + switch to a new branch
git switch main              # switch back
git merge feature-x          # merge feature-x into the current branch
git branch -d feature-x      # delete a merged branch
```

## Undoing things (from gentle → forceful)

```bash
git restore file.js                # discard unstaged edits to a file (can't undo!)
git restore --staged file.js       # unstage but keep edits
git commit --amend -m "New msg"    # fix the LAST commit's message/contents (before pushing)
git revert <commit>                # make a NEW commit that undoes an old one (safe, keeps history)
git reset --soft HEAD~1            # undo last commit, KEEP changes staged
git reset --hard HEAD~1            # undo last commit AND delete the changes — destructive
```

Rule of thumb: once you've **pushed**, prefer `git revert` over `reset` —
rewriting pushed history causes problems.

## One-time setup

```bash
git config --global user.name "isaakistarn"
git config --global user.email "isaak@cudesign.com.au"
git config --global init.defaultBranch main
```

---

## Your day-to-day recipe

```bash
git pull                         # 1. get latest (matters once the desktop is also pushing)
# ... make your edits ...
git status                       # 2. see what changed
git add -A                       # 3. stage it
git commit -m "Describe change"  # 4. commit locally
git push                         # 5. publish to GitHub
```

## On your desktop (first time)

```bash
git clone https://github.com/isaakistarn/Schoolwork.git
cd Schoolwork
npm install
# then follow DESKTOP-MIGRATION.md
```

Two tips that'll save you: run `git status` before every `add`/`commit` so
there are no surprises, and `git pull` before you start editing once both
machines are pushing — that prevents merge conflicts.
