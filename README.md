# Peridot

An offline practice app for the GP Paper 2 "explain the word/phrase" questions,
with a second timed **Synonym Rush** game.

In **Cards**, Peridot shows the surrounding passage paragraph, with the examined
sentence and target phrase highlighted. You type a paraphrase and the app marks
it against the paper's answer scheme, concept by concept. Each card is labelled
**Exam question**, **Adapted from exam** or **Created by me**, so you always know
whether the question came from the paper or was written for extra practice.

In **Synonyms**, the app mines words from every passage and gives you sixty
seconds to type as many synonyms as you can. Strong synonyms score more than
loose ones, and consecutive accepted answers build a score multiplier.

After the page loads it makes no network requests: no CDN, no analytics, no
external fonts, no account.

## Quick start (from GitHub)

Clone the repository, then start the local server:

```bash
git clone https://github.com/Supreme6665/para.git
cd para
./run.sh
```

`run.sh` serves the app at `http://127.0.0.1:8000/` and opens it in your default
browser on macOS and Linux desktops. If it does not open automatically, visit
the address printed in the terminal. Press `Ctrl+C` to stop the server.

If you do not have Git, download the repository as a ZIP from GitHub, unzip it,
open a terminal in that folder, and run `./run.sh`.

> This repository is private. You need access to the `Supreme6665` account or an
> invitation, and GitHub authentication (a personal access token or SSH key)
> before cloning it.

## Requirements

| Requirement | Needed for |
| --- | --- |
| A modern browser | Running the app |
| Python 3 | `run.sh` and the local server |
| Git | Cloning and updating the repository |
| Node.js 18 or newer | Running the test suite only |
| `pdftotext` | Re-extracting text from the source PDFs only |

The app itself runs without Python: you can open `index.html` directly. Use the
local server when you want progress to be saved reliably, because some browsers
block `localStorage` on `file://` pages.

## macOS installation

### 1. Install Git and Python 3

macOS usually prompts you to install Git the first time you run it. To check:

```bash
git --version
python3 --version
```

If `git` is missing, run:

```bash
xcode-select --install
```

If `python3` is missing, install it with Homebrew:

```bash
# Install Homebrew first if you do not already have it.
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Then install Python.
brew install python
```

If you prefer not to use Homebrew, download the macOS installer from
[python.org](https://www.python.org/downloads/macos/) and run it. Make sure the
installer's "Install Certificates" step completes.

Check that both commands now work:

```bash
git --version
python3 --version
```

On Apple Silicon Macs, Homebrew installs into `/opt/homebrew`. If `brew` is not
found after installation, follow the shell setup instructions printed by the
Homebrew installer, or run:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2. Clone and start the app

```bash
git clone https://github.com/Supreme6665/para.git
cd para
chmod +x run.sh
./run.sh
```

Then open the address printed in the terminal, normally:

```text
http://127.0.0.1:8000/
```

`run.sh` should open it automatically on macOS. If it does not, run:

```bash
open http://127.0.0.1:8000/
```

### 3. If macOS blocks the script

Downloaded ZIP files can lose the executable bit. If you see
`permission denied`, run:

```bash
chmod +x run.sh
./run.sh
```

Alternatively, run it through Bash:

```bash
bash run.sh
```

### macOS troubleshooting

| Problem | Fix |
| --- | --- |
| `python3: command not found` | Install Python 3 with Homebrew or python.org, then reopen the terminal. |
| `permission denied: ./run.sh` | Run `chmod +x run.sh` and try again. |
| `Address already in use` | `run.sh` normally picks the next free port. To choose one yourself, run `PORT=8080 ./run.sh`. |
| Browser does not open | Copy the printed `http://127.0.0.1:...` address into your browser. |
| Progress does not save | Do not use `index.html` via `file://`; run `./run.sh` and use the localhost address. |
| `git: command not found` | Run `xcode-select --install`, or install Git with `brew install git`. |
| Clone asks for a password | GitHub no longer accepts account passwords for Git. Use a personal access token or SSH. |

Stop the server with `Ctrl+C`.

## Windows installation

Install [Git for Windows](https://git-scm.com/download/win) and
[Python 3](https://www.python.org/downloads/windows/). During Python setup,
tick **Add python.exe to PATH**.

In PowerShell:

```powershell
git clone https://github.com/Supreme6665/para.git
cd para
py -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` in your browser. If you use Git Bash, you can run
`./run.sh` instead.

If `py` is not recognised, try `python -m http.server 8000 --bind 127.0.0.1`.

## Linux installation

Install Python 3 and Git with your distribution's package manager. For example,
on Debian or Ubuntu:

```bash
sudo apt update
sudo apt install python3 git
```

Then:

```bash
git clone https://github.com/Supreme6665/para.git
cd para
chmod +x run.sh
./run.sh
```

Open the printed localhost address. On desktops, `run.sh` tries to open it with
`xdg-open`.

## Push updates to the private GitHub repository

This copy is published in the private repository:

```text
https://github.com/Supreme6665/para
```

The local `origin` remote uses SSH: `git@github.com:Supreme6665/para.git`.

After editing, commit and push:

```bash
git add .
git commit -m "Describe the change"
git push
```

The generated `js/data.js`, `js/synonyms.js` and `js/synonym-game.js` files must
be committed whenever the source data changes, because the browser reads those
files rather than the JSON directly.

If you are setting up a fresh copy instead, initialise it and add the remote:

```bash
git init -b main
git add .
git commit -m "Add Peridot GP Paper 2 practice app"
git remote add origin git@github.com:Supreme6665/para.git
git push -u origin main
```

### Optional: host it on GitHub Pages

GitHub Pages is not enabled for this private repository. On GitHub Free, Pages
requires the repository to be public. If the repository is made public, or your
plan supports private Pages:

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/(root)` folder, then save.
5. Wait for the deployment, then open
   `https://Supreme6665.github.io/para/`.

Progress is tied to the browser origin. Progress made at `localhost` is separate
from progress made at the GitHub Pages address. Use **Export** and **Import** to
move it between them.

## Updating an existing clone

```bash
cd para
git pull
```

There is no install or build step for normal use: the browser loads the committed
files directly. If the app does not reflect a recent change, hard-refresh the
page (`Cmd+Shift+R` on macOS, `Ctrl+Shift+R` on Windows/Linux).

## How to use it

Use the **Cards | Synonyms** switch in the top bar to move between the two
sections. Switching away from a synonym round pauses its clock; switching back
shows a resume button. An unsaved paraphrase draft is also restored when you
return to Cards.

### Cards

Keyboard shortcuts:

- `Enter` checks the answer, or advances after feedback.
- `Shift+Enter` adds a line.
- `Alt+S` skips a card.
- `Esc` opens settings.

Settings let you choose papers, question types and session length, and switch
between three modes:

- **Practice** — work through the selected cards.
- **Due today** — spaced-repetition cards that are due.
- **Weak spots** — cards with low accuracy or low Leitner boxes.

Skipping a card records no attempt.

### Synonym Rush

Start a round from the Synonyms section. The clock counts down once for the
whole round (60 seconds by default; 30, 45, 60 or 90 can be chosen in settings).

- Type a synonym and press `Enter` to add it.
- Press `Alt+N` (or **Next word**) when you are stuck or finished with a word.
- Press **End round** to finish early.
- `Esc` opens settings and pauses the clock.

Scoring:

| Answer | Points |
| --- | --- |
| Strong synonym | 10 |
| Close synonym | 6 |
| Loose synonym | 3 |
| Unrecognised or rejected | 0, streak reset |
| Duplicate | 0, streak kept |

Consecutive accepted answers multiply the next score by `1 + 0.1 × streak`, up
to a maximum of `2×`. The round summary shows your score, accuracy, tier counts,
best chain, and a review of the words you saw with their missed strong synonyms.
High score, best chain and rounds played persist; an active round does not
survive a reload.

## What is in it

- **106 cards** drawn from the answer schemes of thirteen papers: 2025 ACJC;
  2026 ACJC, CJC, EJC, HCI, JPJC, NJC, NYJC, RVHS, SAJC, VJC and YIJC; and
  the 8881 Specimen (JPJC).
- The 2026 RI paper and the Paper 1 MCQ practice paper are not carded: the RI
  file is a question paper without a mark scheme, and the MCQ paper is not a
  Paper 2 "explain the word/phrase" paper.
- Each card keeps the **surrounding passage paragraph**, the whole examined
  sentence, the underlined target, the question, model answers, a "why"
  explanation, and the scheme's do-not-accept notes. Every answer is deducible
  from the text shown on screen.
- Question types: vocabulary in context, literal comprehension, figurative
  language, use of language, and concept/term questions.
- Authorship labels: **Exam question** is the paper's original question;
  **Adapted from exam** starts from an exam question but changes the target,
  scope or marks; **Created by me** is written from the passage with no matching
  exam question.
- Filters for paper, question type and session length, plus three modes:
  practice, due today (spaced repetition) and weak spots.
- **Synonym Rush** mines 380+ prompt words from every passage's context. It does
  not use the card's question or target, so the game is deliberately separate
  from the examined vocabulary. Words are deduplicated by stem, and prompts need
  at least three known synonyms.

The card text is in `data/cards.json`. The source PDFs are kept in the local
`papers/` folder but are **not published with this repository**. The app itself
does not read either at runtime — it loads the generated `js/data.js`.

## How marking works

Marking is deterministic and explainable, not an LLM guess:

1. Your answer is normalised (case, punctuation, contractions).
2. Words are stemmed with a compact Porter stemmer.
3. Each mark-scheme concept has a list of accepted paraphrases.
4. A concept matches when an accepted phrase is present, allowing stemming,
   bundled synonym groups, and a small typo tolerance (edit distance 1–2).
5. Negation is guarded: "not an unseen foundation" cannot earn "unseen
   foundation".
6. `forbid` / "do not accept" terms use strict, stem-only matching so a loose
   synonym cannot trigger a false veto.

Feedback shows which concepts were hit, near-missed or vetoed, the expected
answer, and why. If the machine is too strict, press **I was right** (or
**I was wrong**); the override adjusts your progress and stats without
double-counting the attempt.

This is a study aid, not an examiner. The scheme's acceptable answers are often
broader than any fixed list, so treat a miss as "check the expected answer",
not as a definitive grade.

## Progress and backup

Progress is saved to `localStorage` under `peridot.v1`. Existing progress saved
under the old `para.v1` key is migrated automatically on first load:

- Leitner boxes with intervals of 0, 1, 3, 7 and 16 days.
- A correct answer promotes a card; a full miss resets it; a partial answer
  keeps its box.
- Attempts, accuracy, streaks and per-paper/per-type breakdowns are in **Stats**.
- **Synonym Rush** high score, best chain, last score and rounds played are saved
  in the same backup. An active synonym round is memory-only and restarts after
  a reload.
- **Export** downloads a JSON backup; **Import** restores one. Use this before
  clearing browser data, or to move progress to another machine.
- **Reset** clears progress and settings after a confirmation.

An in-progress card, including submitted feedback, survives a reload.

## Editing the dataset

`data/cards.json` is the source of truth. `data/synonyms.json` supplies the
curated synonym groups used by both marking and Synonym Rush.
`data/synonym-game.json` controls the game's round length, minimum synonyms,
blocklist and optional tier overrides. None of these files are editable from
inside the app.

After editing the data:

```bash
python3 tools/validate.py   # invariants, plus synonym-game config shape
python3 tools/build.py      # regenerates all three js/ data globals
node --test tests/          # matcher, SRS, game engine and dataset checks
```

`validate.py` checks that every target occurs exactly once in its sentence,
that the sentence appears inside its context paragraph, that `origin` is one of
`exam` / `adapted` / `created`, that concept weights add up to the marks, that
no ids are duplicated, and that the Synonym Rush config only uses known tiers.
`build.py` must be run after any data edit, because the browser reads the
generated files, not the JSON.

The game derives closeness from the synonym groups: a term that belongs to all
of a prompt's groups is **strong**, at least half is **close**, and any shared
group is **loose**. `overrides` in `synonym-game.json` can downgrade broad terms
or add explicit rejects without changing the marking data. A prompt must have
at least `minSynonyms` accepted terms (and at least one strong term) before it
enters the pool.

To check a card against its source, place your own copies of the PDFs in
`papers/`, then extract them. The `papers/` folder is local-only and ignored by
Git, so it is not included when cloning the repository.

```bash
python3 tools/extract.py    # -> build/extracted/*.txt (needs pdftotext)
```

Install `pdftotext` if needed:

- macOS: `brew install poppler`
- Debian/Ubuntu: `sudo apt install poppler-utils`
- Windows: install Poppler and add its `bin` folder to `PATH`

### Adding a paper

1. Put the question paper, insert and answer scheme PDFs in the local `papers/`
   folder (not committed).
2. Run `python3 tools/extract.py` to get searchable text.
3. Add cards to `data/cards.json`, using the existing cards as the schema.
4. Run `python3 tools/validate.py`.
5. Run `python3 tools/build.py`.
6. Run `node --test tests/`.
7. Commit the JSON sources and the regenerated `js/data.js`,
   `js/synonyms.js` and `js/synonym-game.js`.

Do not hand-edit `js/data.js`, `js/synonyms.js` or `js/synonym-game.js`; the next
build overwrites them.

## Tests and checks

The test suite uses Node's built-in test runner and needs Node.js 18 or newer:

```bash
node --test tests/
```

It checks the matcher, the spaced-repetition scheduler, the dataset invariants,
the Synonym Rush prompt index and scoring engine, and that every model answer
and accepted phrase earns the marks it should. It also checks that the generated
browser files are in sync with the JSON sources.

## Project structure

```text
index.html            markup and script order
css/style.css         black/grey styling, responsive layout
js/app.js             section switching, session lifecycle, settings, backup
js/ui.js              card/feedback/summary/stats rendering
js/synonym-ui.js      Synonym Rush view, timer and input controller
js/synonym-engine.js  prompt mining, closeness, scoring, round lifecycle
js/matcher.js         normalisation, stemming, synonyms, scoring
js/srs.js             Leitner scheduling and queue building
js/storage.js         localStorage with in-memory fallback
js/data.js            generated card data (window.PERIDOT_DATA)
js/synonyms.js        generated synonym groups (window.PERIDOT_SYNONYMS)
js/synonym-game.js    generated game config (window.PERIDOT_SYNONYM_GAME)
data/cards.json       curated cards — edit this
data/synonyms.json    curated synonym groups — edit this
data/synonym-game.json  Synonym Rush config, blocklist and tier overrides
tools/validate.py     dataset and game-config checks
tools/build.py        JSON -> browser globals
tools/extract.py      PDF -> text for reference
tests/                node:test suite
papers/               source PDFs (local only, not published)
build/extracted/      generated PDF text (not needed at runtime)
run.sh                localhost launcher
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The page is blank | Make sure you opened the repository folder, not a single file copied elsewhere. `index.html`, `css/`, `js/` and `data/` must stay together. |
| Progress disappears | Use the localhost server, not `file://`. Check that the browser is not blocking storage for localhost. |
| Port 8000 is busy | `PORT=8080 ./run.sh`, or let `run.sh` choose the next free port. |
| `python3` is missing | Install Python 3. On macOS: `brew install python`; on Windows: python.org installer with PATH enabled. |
| `node` is missing | You only need Node for tests. Install Node.js 18+ if you want to run `node --test tests/`. |
| Changes do not appear | Hard-refresh the page. If you changed JSON, run `python3 tools/build.py` first. |
| A valid paraphrase is marked wrong | Use **I was right**, or add the phrase to that concept's `accept` list and rebuild. |
| GitHub Pages shows a 404 | Check that Pages is set to the `main` branch and `/(root)`, and that `index.html` is at the repository root. |
| Progress is missing after switching URLs | Progress is per origin. Export from the old address and import at the new one. |

## Notes and limits

- Fully offline after the page loads: no fetch, no CDN, no analytics, no
  external fonts.
- Classic `<script>` tags and no runtime build step, so it also runs from
  `file://` (with the storage caveat above).
- Synonyms are deliberately conservative. If a legitimate paraphrase is marked
  wrong, add the phrase to that concept's `accept` list and rebuild, or use the
  override. Synonym Rush uses the same groups, so expanding them improves both
  sections.
- The Synonym Rush closeness model is group-based, not a live dictionary. A
  correct synonym outside the bundled groups is reported as "not in the synonym
  bank" and scores nothing. This keeps the game deterministic and offline.
- Answer schemes vary in how tightly they define acceptable paraphrases. The
  cards follow the wording of the included schemes; check `note` and
  `doNotAccept` when a mark surprises you.
- This is a study aid, not an official assessment. The exam papers and answer
  schemes remain the property of their respective schools and examination
  boards.

## Contributing

Fork the repository, create a branch, make the change, and run the checks above
before opening a pull request. Keep `data/cards.json` as the source of truth,
regenerate the `js/` data globals with `tools/build.py`, and include both the
sources and generated files in the commit.

## License

No licence file is included in this repository. Add one before redistributing
the app or publishing a modified version. The bundled examination papers and
answer schemes are reference material and are not covered by any licence grant
in this repository.
