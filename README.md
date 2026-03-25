# Solar Landscape Hackathon 2026

Welcome to the Solar Landscape Hackathon.

This repository is owned by Solar Landscape and is public during the event to enable collaboration. All work submitted here becomes part of the official hackathon record.

Please read these instructions carefully before starting.

---

## Repository Rules

- This repository is public during the hackathon, but will moved to a private repository after the hackathon.
- Do not commit secrets (API keys, tokens, passwords, connection strings).
- All work must be committed to GitHub by the submission deadline.
- The final state of your team branch at the deadline will be used for judging.

---

## Team Workflow

### 1. Clone the Repository

```bash
git clone https://github.com/solarlandscape/<repo-name>.git
cd <repo-name>
```

### 2. Commit Early, Commit Often
```bash
git add .
git commit -m "Short descriptive message"
git push
```
Best practices:
 - Use meaningful commit messages
 - Push frequently
 - Keep your branch up to date with main if needed

### 3. Required Submission Structure

Your repository must contain the following before the deadline:
```bash
/
├── README.md
├── src/ (or your main code folder)
├── docs/
│   ├── architecture-diagram.(png|jpg|pdf)
│   └── screenshots/
└── demo.md (optional but encouraged)
```

#### Required README Sections

Update this `README.md` with the following sections:

Project Overview
 - What problem does this solve?
 - Why is it valuable?

Architecture
 - High-level system design
 - Key technologies used
 - Architecture diagram stored in /docs
 - How to run the project

Known Limitations
 - What would you improve with more time?
 - What edge cases are not handled?

### 4. Submission Deadline

All code must be pushed before:

`Friday at 3:30PM EST`

The latest commit timestamp on your team branch will be considered final.

### 5. Code Ownership

By participating, you acknowledge:
 - This repository is owned by Solar Landscape.
 - All submitted code remains in this repository after the event.
 - The organization may use, modify, or build upon submitted projects.