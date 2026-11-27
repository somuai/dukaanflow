# DukaanFlow release gates

## Round 2

The public repository starts the Expo web reviewer build with `docker compose up --build --wait`. It opens on this computer at `http://localhost:8080`, without an API key. The native iPhone build is the path for Wispr keyboard dictation, physical barcode and invoice scanning, Vision OCR, and the Files-based backup workflow.

| Gate | Evidence |
| --- | --- |
| Public source and keyless startup | A fresh anonymous clone of public `main` started healthy in Docker. The release candidate also passed the Compose startup, Expo bundle, and browser isolation-header checks. |
| Reviewer workflow | A fresh browser profile completed shop onboarding, saved Raju's Hinglish credit note, and reopened the ₹100 balance and promised date after a reload. Browser input was typed. |
| PDF pitch | Upload the four-slide `DukaanFlow_Round_2_Editorial.pdf` from the local `output/` folder. It has selectable text for the problem, users, dependencies, and launch plan. |
| Video and portal | Record the consented shop demo described in [the filming plan](round-2-filming.md), check the public or unlisted YouTube link in a signed-out browser, then submit the PDF, link, and repository in the team dashboard. Use the dashboard for the cutoff. |
| Optional live URL | The Docker preview is the reviewer entry point. A hosted URL is optional. |

## Production

The iOS prototype can demonstrate the supported workflow with fictional records. The following gates require evidence before it can be the shop's primary ledger.

| Gate | Evidence required |
| --- | --- |
| Apple distribution | Confirm the permanent bundle ID and Apple team. Produce a distribution-signed archive, inspect its entitlements and privacy manifests, complete App Store Connect privacy disclosures, and verify an install through TestFlight. The local signing identity is a development identity. [Apple submission guidance](https://developer.apple.com/app-store/submitting/) |
| Dependency maintenance | Review the current npm audit findings for the installed Expo stack. The proposed SDK and router upgrade changes compatibility. Validate the minimum iOS target, native archive, Docker export, and migration before adopting it. |
| Reliable counter speech | Verify Flow dictation on supported physical iPhones with Hindi, English, and Hinglish speakers under quiet and busy conditions. Record intended events, transcript, proposed events, corrections, and ledger outcome. Treat any wrong save as a failed acceptance case. Test network-loss fallback separately. [Wispr iPhone setup](https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone) |
| Records and privacy | Verify locked-device protection for SQLite, its journal files and invoice/product media. Exercise attachment-inclusive restore on a physical device and document export handling, retention, deletion, and shared-device access. The current ZIP export is readable by anyone with a copy. |
| Accessibility and field reliability | Complete VoiceOver, Dynamic Type, onboarding permissions, barcode and OCR failure states, and interrupted receipt-save testing on a physical device. Observe a consented pilot alongside the existing shop ledger before relying on live balances. |

Supported notes save after one owner submission. The parser uses deterministic rules and shop catalog matches. Unknown identities, incompatible units, and unsupported combinations can require clarification. A carton conversion comes from the owner-verified catalog variant. Store-ready and broad speech accuracy claims require the gates above.
