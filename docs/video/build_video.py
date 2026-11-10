"""Build the narrated KinVault walkthrough.

Pipeline:
  1. Generate one neural-voice MP3 per scene with edge-tts (cached by text hash).
  2. Lay the narration on an exact timeline (lead-in + tail per scene).
  3. Render 1920x1080 frames with Pillow and pipe them to ffmpeg with the audio.

Run:  python docs/video/build_video.py
      python docs/video/build_video.py --audio-only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import wave
from dataclasses import dataclass, field
from typing import List

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(HERE, "captures")
SLIDES = os.path.join(HERE, "slides")
AUDIO = os.path.join(HERE, "audio")
BUILD = os.path.join(HERE, "build")
OUT = os.path.join(HERE, "kinvault-demo.mp4")

for d in (AUDIO, BUILD):
    os.makedirs(d, exist_ok=True)

W, H = 1920, 1080
FPS = 30

CARD_W = 1400
CARD_X = (W - CARD_W) // 2
CARD_Y = 26
CHROME_H = 38
SHOT_W = CARD_W
SHOT_H = 966
SHOT_X = CARD_X
SHOT_Y = CARD_Y + CHROME_H
CARD_H = CHROME_H + SHOT_H
CARD_BOTTOM = CARD_Y + CARD_H
CAPTION_Y = 1038
BAR_Y = 1074

FONT_DIR = r"C:\Windows\Fonts"
BOLD = os.path.join(FONT_DIR, "segoeuib.ttf")
SEMI = os.path.join(FONT_DIR, "seguisb.ttf")
REG = os.path.join(FONT_DIR, "segoeui.ttf")
MONO = os.path.join(FONT_DIR, "consola.ttf")
MONO_B = os.path.join(FONT_DIR, "consolab.ttf")

GREEN = (52, 211, 153)
MINT = (167, 243, 208)
WHITE = (235, 248, 242)
MUTED = (139, 168, 154)
DIM = (88, 118, 104)
CARD = (6, 22, 16)
DARK = (4, 15, 11)

VOICE = "en-US-AndrewNeural"
RATE = "+4%"
LEAD = 0.55
TAIL = 0.65


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


@dataclass
class Scene:
    name: str
    title: str
    narration: str
    images: List[str]
    chrome: str
    weights: List[float] = field(default_factory=list)
    min_duration: float = 0.0
    caption: bool = True
    # filled in later
    audio: str = ""
    audio_duration: float = 0.0
    duration: float = 0.0
    start: float = 0.0


SCENES: List[Scene] = [
    Scene(
        "landing",
        "The family vault for Bitcoin & MUSD",
        "KinVault is the family vault for Bitcoin and MUSD on Mezo. "
        "This is the sample Rivera family — every screen is the real app.",
        ["01-landing.png"],
        "kinvault-six.vercel.app/",
    ),
    Scene(
        "features",
        "Built for households, not hedge funds",
        "One shared treasury. Spending that needs two signatures. "
        "Bitcoin-backed loans without selling your BTC. And savings locked until a birthday.",
        ["02-features.png"],
        "kinvault-six.vercel.app/",
    ),
    Scene(
        "auth",
        "Sign in your way",
        "Sign in with email, Google, or a wallet signature. "
        "The family never shares a private key — and every vault starts with six seats.",
        ["03-auth.png", "04-auth-signup.png"],
        "kinvault-six.vercel.app/auth",
        weights=[2, 1],
    ),
    Scene(
        "dashboard",
        "One treasury, every member",
        "Treasury, BTC reserve, loans outstanding, and every member's sub-account. "
        "Deposit MUSD or Bitcoin into the shared vault, or withdraw to a linked wallet.",
        [
            "05-dashboard.png",
            "09-deposit-dialog.png",
            "10-deposit-btc.png",
            "12-withdraw-dialog.png",
            "13-withdraw-amount.png",
        ],
        "kinvault-six.vercel.app/dashboard",
        weights=[3, 2, 2, 2, 1],
        min_duration=12.8,
    ),
    Scene(
        "roles",
        "Six seats, clear permissions",
        "Roles set permissions — admin, spouse, teen, or kid. "
        "Switch who you're acting as, and the limits change with you.",
        ["07-acting-menu.png", "08-acting-mom.png", "06-members.png"],
        "kinvault-six.vercel.app/dashboard",
        weights=[2, 2, 2],
        min_duration=9.2,
    ),
    Scene(
        "setup",
        "Start a vault, or join with a code",
        "Start a new vault, or join one with a private invite code. "
        "Up to six seats, each with its own role and age.",
        ["28-onboarding-create.png", "29-onboarding-join.png"],
        "kinvault-six.vercel.app/onboarding",
        weights=[2, 1],
    ),
    Scene(
        "spending",
        "Two approvals, zero surprises",
        "Expenses over a hundred dollars need two approvals, and nobody can approve their own. "
        "Under a hundred, it auto-approves. Filter by category, and see exactly where the money went.",
        [
            "14-spending.png",
            "15-approved.png",
            "16-expense-dialog.png",
            "17-filters.png",
        ],
        "kinvault-six.vercel.app/spending",
        weights=[3, 2, 2, 3],
        min_duration=12.8,
    ),
    Scene(
        "loans",
        "Borrow against BTC, keep the BTC",
        "Borrow against the family's Bitcoin instead of selling it. "
        "Set collateral and LTV, stress-test a BTC drop, then mint MUSD into the vault. "
        "Repay in part, or repay in full to close the trove.",
        ["18-loans.png", "19-stress.png", "20-borrowed.png", "21-repaid.png"],
        "kinvault-six.vercel.app/loans",
        weights=[3, 2, 2, 3],
        min_duration=14.2,
    ),
    Scene(
        "trust",
        "Lockboxes with letters",
        "Lockboxes hold savings until a milestone date. Then two guardians sign, the funds unlock, "
        "and the letter opens. Every lockbox carries a letter, and anyone can add to it.",
        ["22-trust.png", "23-letter.png", "24-contribute.png", "25-released.png"],
        "kinvault-six.vercel.app/trust",
        weights=[3, 2, 2, 3],
        min_duration=13.8,
    ),
    Scene(
        "new-lockbox",
        "A letter for the day it opens",
        "A new lockbox takes a goal, a date, a milestone, and a letter. It stays sealed until the day.",
        ["26-new-lockbox.png"],
        "kinvault-six.vercel.app/trust",
        min_duration=7.6,
    ),
    Scene(
        "receipts",
        "Receipts you can verify",
        "Every action leaves a receipt hash chained to the one before it, with its Mezo block height. "
        "Verify the chain, and nothing has changed.",
        ["27-receipts.png"],
        "kinvault-six.vercel.app/trust",
        min_duration=9.3,
    ),
    Scene(
        "arch",
        "Verified on chain, not in a database",
        "Live mode never trusts the browser. The wallet signs, the server reads the Mezo receipt, "
        "checks token, sender, recipient, amount, chain and confirmations — then the ledger writes once.",
        [os.path.join(SLIDES, "arch.png")],
        "KinVault  ·  how live mode works",
        min_duration=13.6,
    ),
    Scene(
        "close",
        "",
        "KinVault — Bitcoin and MUSD, owned together. "
        "Deployed on Mezo Testnet at kinvault-six.vercel.app.",
        [os.path.join(SLIDES, "close.png")],
        "kinvault-six.vercel.app",
        caption=False,
        min_duration=8.0,
    ),
]


# ---------------------------------------------------------------- narration


def narration_path(scene: Scene, index: int) -> str:
    return os.path.join(AUDIO, f"{index + 1:02d}-{scene.name}.mp3")


def text_hash(scene: Scene) -> str:
    raw = f"{VOICE}|{RATE}|{scene.narration}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def ensure_narration(scene: Scene, index: int) -> None:
    path = narration_path(scene, index)
    manifest_path = os.path.join(AUDIO, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        manifest = json.load(open(manifest_path, "r", encoding="utf-8"))

    key = scene.name
    digest = text_hash(scene)
    entry = manifest.get(key)
    if not (entry and entry.get("hash") == digest and os.path.exists(path)):
        print(f"  voice {index + 1:02d} {scene.name} ...", flush=True)
        cmd = [
            sys.executable,
            "-m",
            "edge_tts",
            "--voice",
            VOICE,
            f"--rate={RATE}",
            "--text",
            scene.narration,
            "--write-media",
            path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        manifest[key] = {"hash": digest, "file": os.path.basename(path)}
        with open(manifest_path, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)

    from mutagen.mp3 import MP3

    scene.audio = path
    scene.audio_duration = float(MP3(path).info.length)


def plan_timeline() -> None:
    t = 0.0
    for scene in SCENES:
        natural = LEAD + scene.audio_duration + TAIL
        scene.duration = max(natural, scene.min_duration)
        scene.start = t
        t += scene.duration


# ---------------------------------------------------------------- audio track


def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def decode_pcm(path: str) -> bytes:
    cmd = [
        ffmpeg_exe(),
        "-v",
        "error",
        "-i",
        path,
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
    ]
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def build_audio_track() -> str:
    rate, channels, width = 48000, 2, 2
    silence = b"\x00" * (rate * channels * width)
    out_path = os.path.join(BUILD, "narration.wav")

    with wave.open(out_path, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(width)
        wav.setframerate(rate)
        for scene in SCENES:
            pcm = bytearray(decode_pcm(scene.audio))
            # 8 ms fade at both ends removes any codec click.
            fade = int(rate * 0.008) * channels * width
            for i in range(0, fade, width):
                if i + width > len(pcm):
                    break
                g = i / fade
                for ch in range(2):
                    off = i + ch * width
                    if off + 2 <= len(pcm):
                        v = int.from_bytes(pcm[off : off + 2], "little", signed=True)
                        pcm[off : off + 2] = int(v * g).to_bytes(2, "little", signed=True)
            for i in range(0, fade, width):
                j = len(pcm) - fade + i
                if j < 0 or j + width > len(pcm):
                    break
                g = 1 - i / fade
                for ch in range(2):
                    off = j + ch * width
                    if off + 2 <= len(pcm):
                        v = int.from_bytes(pcm[off : off + 2], "little", signed=True)
                        pcm[off : off + 2] = int(v * g).to_bytes(2, "little", signed=True)

            lead = b"\x00" * int(round(LEAD * rate)) * channels * width
            used = LEAD + len(pcm) / (rate * channels * width)
            tail = max(0.0, scene.duration - used)
            pad = b"\x00" * int(round(tail * rate)) * channels * width
            wav.writeframes(lead + bytes(pcm) + pad)

    return out_path


# ---------------------------------------------------------------- visuals


def vertical_gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return grad.resize((W, H))


def make_background() -> Image.Image:
    img = vertical_gradient((4, 15, 11), (9, 33, 24)).convert("RGBA")

    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 48):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 6))
    for y in range(0, H, 48):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 6))
    img = Image.alpha_composite(img, grid)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(W - 620, -320), (W + 260, 460)], fill=(16, 185, 129, 52))
    gd.ellipse([(-340, H - 420), (420, H + 240)], fill=(5, 150, 105, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    img = Image.alpha_composite(img, glow)

    # Card shadow + base are static, so bake them into the background once.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [(CARD_X - 6, CARD_Y + 14), (CARD_X + CARD_W + 6, CARD_BOTTOM + 22)],
        radius=22,
        fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    img = Image.alpha_composite(img, shadow)

    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(base)
    bd.rounded_rectangle(
        [(CARD_X, CARD_Y), (CARD_X + CARD_W, CARD_BOTTOM)],
        radius=14,
        fill=CARD + (255,),
    )
    img = Image.alpha_composite(img, base)
    return img.convert("RGB")


def make_chrome(scene: Scene) -> Image.Image:
    bar = Image.new("RGBA", (CARD_W, CHROME_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(bar)
    # Round only the top corners: draw a taller rounded rect and crop it.
    tall = Image.new("RGBA", (CARD_W, CHROME_H + 20), (0, 0, 0, 0))
    td = ImageDraw.Draw(tall)
    td.rounded_rectangle([(0, 0), (CARD_W, CHROME_H + 20)], radius=14, fill=(10, 34, 26, 255))
    bar.alpha_composite(tall.crop((0, 0, CARD_W, CHROME_H)))

    for i, color in enumerate([(248, 113, 113), (251, 191, 36), (52, 211, 153)]):
        cx = 20 + i * 17
        d.ellipse([(cx - 5, 19 - 5), (cx + 5, 19 + 5)], fill=color + (255,))

    pill_x, pill_y, pill_w, pill_h = 82, 8, 620, 22
    d.rounded_rectangle(
        [(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)],
        radius=6,
        fill=(15, 46, 36, 255),
        outline=(28, 68, 54, 255),
    )
    d.ellipse([(pill_x + 12, pill_y + 8), (pill_x + 18, pill_y + 14)], fill=(52, 211, 153, 255))
    d.text(
        (pill_x + 26, pill_y + 4),
        scene.chrome,
        font=font(MONO, 12),
        fill=(150, 182, 167),
    )

    d.ellipse([(CARD_W - 150, 16), (CARD_W - 142, 24)], fill=(52, 211, 153, 255))
    d.text(
        (CARD_W - 134, 12),
        "Mezo Testnet",
        font=font(SEMI, 12),
        fill=(170, 200, 185),
    )
    return bar


def make_border() -> Image.Image:
    border = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(border)
    d.rounded_rectangle(
        [(0, 0), (CARD_W - 1, CARD_H - 1)],
        radius=14,
        outline=(36, 82, 65, 255),
        width=1,
    )
    return border


def make_shot_mask() -> Image.Image:
    mask = Image.new("L", (SHOT_W, SHOT_H), 0)
    d = ImageDraw.Draw(mask)
    # Taller rounded rect cropped at the top so only the bottom corners round.
    d.rounded_rectangle([(0, -16), (SHOT_W, SHOT_H - 1)], radius=14, fill=255)
    return mask


def make_caption(scene: Scene, number: int) -> Image.Image:
    strip = Image.new("RGBA", (W, 40), (0, 0, 0, 0))
    if not scene.caption:
        return strip
    d = ImageDraw.Draw(strip)
    title_font = font(SEMI, 16)
    num_font = font(MONO_B, 13)
    tw = d.textlength(scene.title, font=title_font)
    pill_w = 30 + 26 + 8 + tw + 18
    pill_h = 32
    d.rounded_rectangle(
        [(CARD_X, 2), (CARD_X + pill_w, 2 + pill_h)],
        radius=16,
        fill=(5, 19, 14, 232),
        outline=(34, 80, 63, 255),
    )
    d.ellipse([(CARD_X + 15, 16), (CARD_X + 23, 24)], fill=GREEN + (255,))
    d.text(
        (CARD_X + 32, 11),
        f"{number:02d}",
        font=num_font,
        fill=GREEN,
    )
    d.text(
        (CARD_X + 64, 8),
        scene.title,
        font=title_font,
        fill=WHITE,
    )

    label = "MEZO TESTNET  ·  CHAIN 31611"
    d.text(
        (W - CARD_X, 13),
        label,
        font=font(MONO, 11),
        fill=(86, 116, 102),
        anchor="ra",
    )
    return strip


def load_shot(path: str) -> Image.Image:
    """Load at 4% above the card size so the slow zoom always has pixels to crop."""
    img = Image.open(path).convert("RGB")
    return img.resize(
        (int(SHOT_W * 1.04), int(SHOT_H * 1.04)), Image.Resampling.LANCZOS
    )


def beat_at(scene: Scene, local: float) -> tuple[int, float]:
    """Return (image index, progress inside the scene)."""
    p = min(max(local / scene.duration, 0.0), 0.999999)
    weights = scene.weights or [1] * len(scene.images)
    total = sum(weights)
    acc = 0.0
    for i, wt in enumerate(weights):
        nxt = acc + wt / total
        if p < nxt or i == len(weights) - 1:
            return i, (p - acc) / (wt / total)
        acc = nxt
    return len(weights) - 1, 1.0


def ease(t: float) -> float:
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def render_shot(base: Image.Image, scene: Scene, local: float) -> Image.Image:
    idx, bp = beat_at(scene, local)

    # Alternate slow push-in / pull-out so consecutive scenes do not feel identical.
    span = 0.035
    z = 1.0 + span * ease(bp) if idx % 2 == 0 else 1.0 + span * (1 - ease(bp))
    scale = base.width / SHOT_W
    cw, ch = (SHOT_W / z) * scale, (SHOT_H / z) * scale
    left = (base.width - cw) / 2
    top = (base.height - ch) / 2
    shot = base.crop(
        (int(left), int(top), int(left + cw), int(top + ch))
    ).resize((SHOT_W, SHOT_H), Image.Resampling.LANCZOS)

    # Fade each beat in from the card colour.
    weights = scene.weights or [1] * len(scene.images)
    total = sum(weights)
    beat_start_p = sum(weights[:idx]) / total
    beat_len = (weights[idx] / total) * scene.duration
    age = local - beat_start_p * scene.duration
    if age < 0.22 and beat_len > 0.4:
        shot = Image.blend(Image.new("RGB", shot.size, CARD), shot, age / 0.22)
    return shot


def render_frame(
    t: float,
    background: Image.Image,
    chrome: List[Image.Image],
    border: Image.Image,
    captions: List[Image.Image],
    shots: List[List[Image.Image]],
    mask: Image.Image,
) -> Image.Image:
    # Locate scene.
    scene = SCENES[-1]
    for s in SCENES:
        if t < s.start + s.duration:
            scene = s
            break
    idx = SCENES.index(scene)
    local = t - scene.start

    frame = background.copy()
    beat_idx, _ = beat_at(scene, local)
    shot = render_shot(shots[idx][beat_idx], scene, local)
    frame.paste(shot, (SHOT_X, SHOT_Y), mask)
    frame.paste(chrome[idx], (CARD_X, CARD_Y), chrome[idx])
    frame.paste(border, (CARD_X, CARD_Y), border)

    cap = captions[idx]
    cap_y = CAPTION_Y + int(8 * (1 - ease(local / 0.35)))
    frame.paste(cap, (0, cap_y), cap)

    # Progress bar.
    total = SCENES[-1].start + SCENES[-1].duration
    d = ImageDraw.Draw(frame)
    d.rectangle([(0, BAR_Y), (W, BAR_Y + 4)], fill=(9, 30, 22))
    d.rectangle([(0, BAR_Y), (int(W * min(t / total, 1.0)), BAR_Y + 4)], fill=(16, 185, 129))

    # Global fade in / out.
    fade = 1.0
    if t < 0.55:
        fade = t / 0.55
    elif t > total - 0.75:
        fade = max(0.0, (total - t) / 0.75)
    if fade < 1.0:
        frame = Image.blend(Image.new("RGB", frame.size, (0, 0, 0)), frame, ease(fade))
    return frame


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    print("Narration:", VOICE, RATE)
    for i, scene in enumerate(SCENES):
        ensure_narration(scene, i)
        print(f"  {i + 1:02d} {scene.name:<12} {scene.audio_duration:5.2f}s")
    plan_timeline()

    total = SCENES[-1].start + SCENES[-1].duration
    print(f"Timeline: {total:.1f}s  ({int(total // 60)}:{total % 60:04.1f})")

    audio_path = build_audio_track()
    print("Audio:", audio_path)

    if args.audio_only:
        return

    print("Preparing visuals ...")
    background = make_background()
    chrome = [make_chrome(s) for s in SCENES]
    border = make_border()
    captions = [make_caption(s, i + 1) for i, s in enumerate(SCENES)]
    mask = make_shot_mask()

    shots: List[List[Image.Image]] = []
    for scene in SCENES:
        beat_images = []
        for rel in scene.images:
            path = rel if os.path.isabs(rel) else os.path.join(CAP, rel)
            if not os.path.exists(path):
                raise SystemExit(f"missing capture: {path}")
            beat_images.append(load_shot(path))
        shots.append(beat_images)

    if args.preview:
        marks = [1.5, 12, 26, 34, 44, 55, 66, 78, 92, 108, 118, 130, 135.5]
        for n, t in enumerate(marks):
            frame = render_frame(t, background, chrome, border, captions, shots, mask)
            path = os.path.join(BUILD, f"preview-{n:02d}.png")
            frame.save(path)
            print("wrote", path)
        return

    frames = int(math.ceil(total * FPS))
    ffmpeg = ffmpeg_exe()
    cmd = [
        ffmpeg,
        "-y",
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-i",
        audio_path,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level",
        "4.2",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        OUT,
    ]
    print(f"Rendering {frames} frames -> {OUT}")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        for i in range(frames):
            t = i / FPS
            frame = render_frame(t, background, chrome, border, captions, shots, mask)
            proc.stdin.write(frame.tobytes())
            if i % 150 == 0:
                print(f"  {i / frames * 100:5.1f}%", flush=True)
        proc.stdin.close()
    finally:
        code = proc.wait()
    if code != 0:
        raise SystemExit(f"ffmpeg exited with {code}")
    print("Done:", OUT, f"{os.path.getsize(OUT) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
