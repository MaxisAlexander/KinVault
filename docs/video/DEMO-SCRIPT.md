# KinVault demo video — script and build notes

**File:** [`kinvault-demo.mp4`](kinvault-demo.mp4) · 2:19 · 1920×1080 · 30 fps ·
narrated by `en-US-AndrewNeural` (edge-tts) · H.264 + AAC, −16 LUFS.

The walkthrough uses the **sample Rivera family** in demo mode. The header pill,
BTC price and Mezo block height are read live from Mezo Testnet (chain 31611).
Live-mode writes need a signed-in family and a funded browser wallet, so the
video shows the product surface and the verification architecture instead.

## Scenes

| #   | Time          | Page                   | Narration                                                                                                                                                                                                                                |
| --- | ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | 0:00 – 0:09   | Landing                | KinVault is the family vault for Bitcoin and MUSD on Mezo. This is the sample Rivera family — every screen is the real app.                                                                                                              |
| 02  | 0:09 – 0:19   | Landing / features     | One shared treasury. Spending that needs two signatures. Bitcoin-backed loans without selling your BTC. And savings locked until a birthday.                                                                                             |
| 03  | 0:19 – 0:28   | Sign in                | Sign in with email, Google, or a wallet signature. The family never shares a private key — and every vault starts with six seats.                                                                                                        |
| 04  | 0:28 – 0:41   | Dashboard              | Treasury, BTC reserve, loans outstanding, and every member's sub-account. Deposit MUSD or Bitcoin into the shared vault, or withdraw to a linked wallet.                                                                                 |
| 05  | 0:41 – 0:50   | Dashboard / roles      | Roles set permissions — admin, spouse, teen, or kid. Switch who you're acting as, and the limits change with you.                                                                                                                        |
| 06  | 0:50 – 0:58   | Onboarding             | Start a new vault, or join one with a private invite code. Up to six seats, each with its own role and age.                                                                                                                              |
| 07  | 0:58 – 1:11   | Spending               | Expenses over a hundred dollars need two approvals, and nobody can approve their own. Under a hundred, it auto-approves. Filter by category, and see exactly where the money went.                                                       |
| 08  | 1:11 – 1:25   | Loans                  | Borrow against the family's Bitcoin instead of selling it. Set collateral and LTV, stress-test a BTC drop, then mint MUSD into the vault. Repay in part, or repay in full to close the trove.                                            |
| 09  | 1:25 – 1:39   | Trust                  | Lockboxes hold savings until a milestone date. Then two guardians sign, the funds unlock, and the letter opens. Every lockbox carries a letter, and anyone can add to it.                                                                 |
| 10  | 1:39 – 1:47   | Trust / new lockbox    | A new lockbox takes a goal, a date, a milestone, and a letter. It stays sealed until the day.                                                                                                                                            |
| 11  | 1:47 – 1:56   | Receipts               | Every action leaves a receipt hash chained to the one before it, with its Mezo block height. Verify the chain, and nothing has changed.                                                                                                  |
| 12  | 1:56 – 2:10   | Architecture           | Live mode never trusts the browser. The wallet signs, the server reads the Mezo receipt, checks token, sender, recipient, amount, chain and confirmations — then the ledger writes once.                                                  |
| 13  | 2:10 – 2:19   | Close                  | KinVault — Bitcoin and MUSD, owned together. Deployed on Mezo Testnet at kinvault-six.vercel.app.                                                                                                                                       |

## How it is built

`build_video.py` generates the narration, lays it on an exact timeline, renders
1920×1080 frames with Pillow and pipes them to ffmpeg:

1. **Narration** — one MP3 per scene via `edge_tts`, cached by a hash of the
   text so edits only regenerate the affected scene.
2. **Timeline** — each scene lasts `0.55 s lead + narration + 0.65 s tail`
   (with a minimum for scenes that show several screenshots). The audio track
   uses the same durations, so the voice and the cuts cannot drift.
3. **Visuals** — each capture sits in a 1400×966 browser card on a dark green
   background. Slow push-in/pull-out, a lower-third scene title, a progress bar,
   and a fade between screenshots.
4. **Encode** — raw RGB frames → `libx264` (CRF 18, High profile) with AAC
   narration, then a loudness pass to −16 LUFS.

### Rebuild

```powershell
python docs/video/make_slides.py      # architecture + close slides
python docs/video/build_video.py      # narration, audio, frames, MP4
python docs/video/build_video.py --preview   # a few still frames
```

Requires `edge-tts`, `pillow`, `mutagen` and `imageio-ffmpeg` (which supplies
the ffmpeg binary). Captures live in `docs/video/captures/`; the two designed
slides are in `docs/video/slides/`.

### Captures

The page screenshots are 1296×894 from the production deployment
(https://kinvault-six.vercel.app). The onboarding captures use the same app
locally, because `/onboarding` is behind the auth guard in production.
