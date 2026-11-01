# Noni — agent rules

Ye rules is repo me kaam karne wale har AI agent ke liye hain. Inhe follow karna zaroori hai.

## 🚫 Releases / npm

- **NEVER** `npm publish`, `npm login`, `npm logout`, `npm token`, `npm unpublish`, `npm owner`, ya koi bhi registry-write command chalao.
- **NEVER** `package.json` ka `version` bump karo — jab tak user explicitly na bole.
- Publish, OTP aur auth **maintainer khud** karte hain. Tum sirf code change karke batao ki kya publish karna hai.
- Auth error (`E401` / `EOTP` / `E404`) aaye to fix karne ki koshish mat karo — user ko bata do.

## 🚫 Test directory

- **`test/`, `tests/`, `__tests__/` ya koi bhi test directory create mat karo.**
- Test files add mat karo, aur `bun test` script wapas mat add karo.
- Verification ke liye `bun run typecheck` aur manual run use karo.

## ✅ Workflow

- Code change ke baad: `bun run typecheck` chalao.
- Commit/push sirf tab karo jab user kahe, ya task ka hissa ho.
- Existing structure, naming aur style follow karo.
- `logs` folder nahi banega — logs in-memory + live TUI me hain. File logging sirf `NONI_LOG_FILE=1` pe.

## 💬 Communication

- Hinglish (Roman) me jawab do, concise rakho, feminine grammar ("kar rahi hoon").
- Risky/destructive kaam se pehle user se confirm karo.
