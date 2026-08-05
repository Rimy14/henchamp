# Git Workflow — HenChamp

Practical reference for Kusal (Dev 1) working alongside Deepana (Dev 2) and Rimaz (Dev 3) in one repo.

**Repo:** `https://github.com/oshan3kanayake/henchamp` · **Default branch:** `main`
**Your identity here:** `KusalPabasara <kusalpabasararcg@gmail.com>`

---

## 0. Current state

One commit (`31a314b Initial commit`), everything on `main`, no branches, no tags. Three developers are about to start work in three different areas of the same codebase.

**Start branching now.** Three people committing straight to `main` on a project with this much surface area means daily conflicts and no way to review anything.

---

## 1. Daily loop

The 90% case. Learn these six commands and you're covered.

```bash
# 1. Start from a fresh main
git checkout main
git pull origin main

# 2. Branch for the thing you're about to do
git checkout -b feat/isp-subscriber-provisioning

# ... write code ...

# 3. See what you changed
git status
git diff

# 4. Stage and commit
git add server/services/isp/provisioning.service.js
git commit -m "feat(isp): provision subscribers into radcheck and radusergroup"

# 5. Push (first time on a new branch needs -u)
git push -u origin feat/isp-subscriber-provisioning

# 6. Later pushes on the same branch
git push
```

---

## 2. Branch naming

`<type>/<area>-<short-description>`, lowercase, hyphens.

| Prefix | Use for | Example |
|---|---|---|
| `feat/` | new functionality | `feat/isp-voucher-generation` |
| `fix/` | bug fix | `fix/isp-gigawords-overflow` |
| `chore/` | tooling, deps, config | `chore/db-timezone-kenya` |
| `docs/` | documentation only | `docs/isp-plan` |
| `refactor/` | restructuring, no behaviour change | `refactor/isp-services-split` |

Because three people share the repo, **put `isp-` in your branch names**. It makes `git branch -a` readable at a glance and signals ownership without asking.

Keep branches short-lived — a few days at most. A branch open for three weeks is a merge conflict with a countdown timer.

---

## 3. Commit messages

Conventional Commits: `type(scope): summary`

```
feat(isp): bind voucher to MAC address on first login
fix(isp): fold gigawords into usage totals above 4 GiB
chore(db): make connection timezone configurable, default UTC+3
docs(isp): add implementation plan and learning guide
test(isp): cover rate-limit string builder
refactor(isp): extract RouterOS REST client from controller
```

Rules that matter:

- **Imperative mood** — "add", not "added"/"adds". It reads as *"this commit will add…"*.
- **Under ~72 characters** for the summary line.
- **No trailing period.**
- **One logical change per commit.** If the summary needs "and", it's probably two commits.
- Scope is the subsystem: `isp`, `db`, `auth`, `pos`, `portal`.

Body for anything non-obvious — blank line, then the *why*:

```
fix(isp): fold gigawords into usage totals above 4 GiB

Acct-Input-Octets is a 32-bit counter and wraps at 4 GiB. Without
adding Acct-Input-Gigawords * 2^32, a subscriber on a 20 GB plan
reported ~1.2 GB and was never capped.

Refs A6.
```

Reference the requirement ID (`A5`, `B2`, `D4`) when a commit maps to one. It makes the PDF traceable to the code six months from now.

---

## 4. Pull requests

Push a branch, then open a PR against `main`.

```bash
# with the gh CLI
gh pr create --base main \
  --title "feat(isp): subscriber provisioning into FreeRADIUS" \
  --body "Implements A1/A3. Writes radcheck + radusergroup rows transactionally.

Tested against CHR 7.x lab: subscriber created in UI authenticates over PPPoE.

Refs: docs/ISP_PLAN.md Phase 2"
```

Or just push and use the link GitHub prints.

**Get Dev 2 to review anything touching `isp_subscriptions` or `lifecycle.service.js`** — that's the shared surface, and a silent change there breaks their billing.

Useful PR commands:

```bash
gh pr list                  # what's open
gh pr view 12               # read one
gh pr checkout 12           # check out someone's branch to test it
gh pr merge 12 --squash     # merge (squash keeps main's history clean)
```

---

## 5. Staying in sync

Pull `main` into your branch regularly — daily if others are active. Small conflicts beat one huge one.

```bash
git checkout main
git pull origin main
git checkout feat/isp-vouchers
git merge main
```

`merge` over `rebase` here: it's safe on a shared branch and you can't lose work with it. Only rebase a branch nobody else has pulled.

### Conflicts

```bash
git merge main
# CONFLICT (content): Merge conflict in server/server.js

git diff --name-only --diff-filter=U   # which files
# edit them, remove <<<<<<< ======= >>>>>>> markers
git add server/server.js
git commit                              # completes the merge

git merge --abort                       # or: back out entirely
```

**`server/server.js` and `public/js/frame.js` are the two files all three of you will touch** — route mounting and sidebar nav. Conflicts there are near-certain. Keep your edits to those files down to the minimum lines (one `import` + one `app.use`) so conflicts stay trivial.

---

## 6. Undoing things

| Situation | Command |
|---|---|
| Unstage a file | `git restore --staged <file>` |
| Discard uncommitted changes to a file | `git restore <file>` ⚠️ unrecoverable |
| Fix the last commit message | `git commit --amend` |
| Add a forgotten file to the last commit | `git add <file> && git commit --amend --no-edit` |
| Undo last commit, keep the changes | `git reset --soft HEAD~1` |
| Undo last commit, discard the changes | `git reset --hard HEAD~1` ⚠️ |
| Revert an already-pushed commit | `git revert <sha>` ← safe on shared branches |
| Park work to switch branches | `git stash` → `git stash pop` |
| See what you did recently | `git reflog` ← recovers "lost" commits |

⚠️ **Never `--amend` or `reset --hard` a commit you've already pushed to a shared branch.** It rewrites history and breaks everyone else's clone. On `main`, use `git revert`.

---

## 7. Repo hygiene

### `.env` is correctly ignored — verify it stays that way

```bash
git check-ignore -v .env    # should print: .gitignore:6:.env  .env
```

Before every push, glance at `git diff --cached --name-only`. Committing `.env` means the DB password, JWT secret, and eventually the **RADIUS shared secret, MikroTik admin password, and M-Pesa Daraja keys** land in a public repo's history — where deleting the file doesn't remove them.

When ISP work starts, add to `.env.example` (placeholders only, never real values):

```
DB_TIMEZONE=+03:00
RADIUS_DB_HOST= / RADIUS_DB_USER= / RADIUS_DB_PASSWORD= / RADIUS_DB_NAME=
ISP_ENCRYPTION_KEY=
MIKROTIK_API_HOST= / MIKROTIK_API_USER= / MIKROTIK_API_PASSWORD=
```

If a secret ever does get pushed: **rotate it immediately.** Rewriting history is secondary — assume it's already scraped.

### `package-lock.json` is gitignored — this is a problem

[`.gitignore:3`](../.gitignore#L3) excludes `package-lock.json`. On a three-developer project that means each of you resolves different transitive versions, and prod may differ from all three. Classic "works on my machine".

Recommended (raise with the team first — it's a shared decision):

```bash
git rm --cached .gitignore   # not needed; edit the file instead
# remove the package-lock.json line from .gitignore, then:
git add .gitignore package-lock.json
git commit -m "chore: track package-lock.json for reproducible installs"
```

---

## 8. Useful inspection

```bash
git log --oneline -20                          # recent history
git log --oneline --graph --all --decorate     # branch topology
git log --oneline -- server/services/isp/      # history of one path
git log -p -- server/config/database.js        # full diffs for a file
git blame server/config/database.js            # who wrote line N, and when
git diff main...HEAD                           # everything my branch adds
git diff --stat main...HEAD                    # just the file/line summary
git branch -a                                  # all branches, local + remote
git show <sha>                                 # one commit in full
```

---

## 9. Commit sequence for the ISP build

Roughly how the phases in [ISP_PLAN.md](ISP_PLAN.md) should land. One PR per phase; commits within a phase stay small.

```
docs/isp-planning
  docs(isp): add implementation plan, learning guide and project memory

chore/db-timezone-kenya
  chore(db): make connection timezone configurable, default UTC+3 for Kenya

feat/isp-schema
  feat(isp): add packages, subscribers and subscriptions tables
  feat(isp): add voucher, NAS, session and usage tables
  feat(isp): seed isp:* permissions into role_permissions

feat/isp-radius-provisioning
  feat(isp): add radius database pool and AES-GCM secret helpers
  feat(isp): add RADIUS policy read/write service
  feat(isp): provision subscribers into radcheck and radusergroup
  feat(isp): add package and subscriber CRUD endpoints

feat/isp-vouchers
  feat(isp): generate voucher batches with unambiguous codes
  feat(isp): bind voucher to MAC address on first login          # A5
  feat(isp): add admin reset-binding action with audit trail
  feat(isp): render printable voucher sheets via pdfkit

feat/isp-usage-tracking
  feat(isp): apply Mikrotik-Rate-Limit from package definition    # A6
  feat(isp): ingest radacct into isp_sessions incrementally
  fix(isp): fold gigawords into usage totals above 4 GiB
  test(isp): cover usage accumulation past 4 GiB

feat/isp-lifecycle
  feat(isp): add RouterOS REST client using native fetch
  feat(isp): suspend and restore subscribers idempotently         # unblocks B2
  feat(isp): reap zombie sessions with stale interim updates

feat/isp-admin-ui
  feat(isp): add subscribers, sessions and vouchers admin pages   # A7
```

---

## 10. Cheat sheet

```bash
# start work
git checkout main && git pull origin main
git checkout -b feat/isp-<thing>

# save work
git add -A
git commit -m "feat(isp): <what this does>"
git push -u origin feat/isp-<thing>

# stay current
git checkout main && git pull origin main
git checkout - && git merge main

# ship
gh pr create --base main --fill
```

---

## A note on how I use git in this project

I don't commit, push, branch, or merge unless you tell me to. When you want something committed, give me the command or say so explicitly — otherwise I leave your working tree alone and just report what changed.
