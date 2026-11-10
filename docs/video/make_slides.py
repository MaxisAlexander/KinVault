"""Render the two designed slides used by the KinVault demo video.

The screenshots are 1296x894; these slides are 1280x883 so they can sit in the
same browser-sized card without looking like a web page.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 883
OUT = os.path.join(os.path.dirname(__file__), "slides")
os.makedirs(OUT, exist_ok=True)

FONT_DIR = r"C:\Windows\Fonts"
BOLD = os.path.join(FONT_DIR, "segoeuib.ttf")
SEMI = os.path.join(FONT_DIR, "seguisb.ttf")
REG = os.path.join(FONT_DIR, "segoeui.ttf")
MONO = os.path.join(FONT_DIR, "consola.ttf")
MONO_B = os.path.join(FONT_DIR, "consolab.ttf")

GREEN = (52, 211, 153)
MINT = (167, 243, 208)
WHITE = (240, 250, 245)
MUTED = (150, 178, 164)
DIM = (110, 140, 126)
CARD = (10, 31, 24)
TERM = (6, 20, 15)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def background() -> Image.Image:
    top = (6, 20, 15)
    bottom = (11, 36, 27)
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / max(1, H - 1)
        grad.putpixel(
            (0, y),
            (
                round(top[0] + (bottom[0] - top[0]) * t),
                round(top[1] + (bottom[1] - top[1]) * t),
                round(top[2] + (bottom[2] - top[2]) * t),
            ),
        )
    img = grad.resize((W, H))
    draw = ImageDraw.Draw(img, "RGBA")
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 7))
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 7))

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(W - 520, -260), (W + 200, 420)], fill=(16, 185, 129, 46))
    gd.ellipse([(-260, H - 360), (360, H + 220)], fill=(5, 150, 105, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    return Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=f) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def pill(draw: ImageDraw.ImageDraw, xy, text: str, f, fg, bg, pad_x=14, pad_y=7):
    x, y = xy
    tw = draw.textlength(text, font=f)
    th = f.size
    draw.rounded_rectangle(
        [(x, y), (x + tw + pad_x * 2, y + th + pad_y * 2)],
        radius=(th + pad_y * 2) // 2,
        fill=bg,
    )
    draw.text((x + pad_x, y + pad_y - 1), text, font=f, fill=fg)


def arch() -> None:
    img = background()
    d = ImageDraw.Draw(img)
    pill(d, (56, 44), "MEZO TESTNET  ·  CHAIN 31611", font(SEMI, 13), MINT, (16, 64, 46))

    d.text((56, 92), "Trust the chain, not the database.", font=font(BOLD, 42), fill=WHITE)
    d.text(
        (56, 148),
        "In live mode every balance change is backed by a verified Mezo receipt.",
        font=font(REG, 18),
        fill=MUTED,
    )
    d.line([(56, 196), (W - 56, 196)], fill=(255, 255, 255, 24), width=1)

    steps = [
        (
            "Wallet signs on Mezo",
            "BorrowerOperations for a trove, or an ERC-20 transfer for MUSD and BTC.",
        ),
        (
            "Only the hash is sent",
            "The browser never posts an amount or a recipient it could invent.",
        ),
        (
            "Server reads the receipt",
            "Mezo RPC, chain 31611, confirmed block, decoded logs and calldata.",
        ),
        (
            "Six independent checks",
            "Token, sender, recipient, amount, chain and confirmation depth.",
        ),
        (
            "The ledger writes once",
            "tx_hash is the primary key, so a replayed transaction fails.",
        ),
    ]

    y = 224
    for i, (title, body) in enumerate(steps, start=1):
        cx, cy = 74, y + 16
        d.ellipse([(cx - 16, cy - 16), (cx + 16, cy + 16)], fill=(16, 64, 46))
        d.text((cx, cy - 9), str(i), font=font(MONO_B, 15), fill=MINT, anchor="ma")
        d.text((108, y), title, font=font(SEMI, 18), fill=WHITE)
        lines = wrap(d, body, font(REG, 14), 500)
        for j, line in enumerate(lines):
            d.text((108, y + 28 + j * 20), line, font=font(REG, 14), fill=MUTED)
        y += 104 if len(lines) <= 1 else 116

    tx, ty, tw, th = 676, 220, 548, 556
    d.rounded_rectangle([(tx, ty), (tx + tw, ty + th)], radius=18, fill=TERM, outline=(31, 74, 58))
    d.rounded_rectangle([(tx, ty), (tx + tw, ty + 44)], radius=18, fill=(11, 34, 26))
    d.rectangle([(tx, ty + 26), (tx + tw, ty + 44)], fill=(11, 34, 26))
    for i, color in enumerate([(248, 113, 113), (251, 191, 36), (52, 211, 153)]):
        d.ellipse([(tx + 18 + i * 20, ty + 16), (tx + 30 + i * 20, ty + 28)], fill=color)
    d.text((tx + 92, ty + 14), "mezo-live-check.ts", font=font(MONO, 13), fill=DIM)

    rows = [
        ("$ bun run test:live", WHITE, True),
        ("chain", "31611  (Mezo Testnet)", None),
        ("block", "16,697,036", None),
        ("MUSD", "0x1189…c503  ·  18 decimals", None),
        ("MEZO", "0x7B7c…0001  ·  18 decimals", None),
        ("BTC / USD", "$72,788.59  (PriceFeed)", None),
        ("MCR", "1.10", None),
        ("gas compensation", "200 MUSD", None),
        ("min net debt", "1,800 MUSD", None),
        ("BorrowerOps", "0xCdF7…beE5", None),
        ("", "", None),
        ("✓ mezo live check: ok", GREEN, True),
    ]
    ry = ty + 68
    for key, value, special in rows:
        if not key and not value:
            ry += 10
            continue
        if special:
            d.text((tx + 26, ry), key, font=font(MONO_B, 14), fill=value)
        else:
            d.text((tx + 26, ry), key, font=font(MONO, 13), fill=DIM)
            d.text((tx + 196, ry), value, font=font(MONO, 13), fill=WHITE if value else DIM)
        ry += 30

    d.text(
        (tx + 26, ty + th - 38),
        "read-only  ·  no private keys in the browser bundle",
        font=font(MONO, 12),
        fill=(90, 118, 105),
    )

    # bottom proof strip
    by = 804
    d.rounded_rectangle([(56, by), (W - 56, by + 44)], radius=12, fill=(13, 46, 34))
    d.ellipse([(76, by + 15), (90, by + 29)], fill=GREEN)
    d.text((82, by + 22), "✓", font=font(BOLD, 11), fill=(6, 20, 15), anchor="mm")
    d.text(
        (104, by + 12),
        "Live mode refuses any action it cannot verify on chain.",
        font=font(SEMI, 16),
        fill=MINT,
    )

    img.save(os.path.join(OUT, "arch.png"))


def close() -> None:
    img = background()
    d = ImageDraw.Draw(img)

    # centre glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(W // 2 - 420, 60), (W // 2 + 420, 660)], fill=(16, 185, 129, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    d = ImageDraw.Draw(img)

    pill(d, (W // 2 - 116, 108), "LIVE ON MEZO TESTNET", font(SEMI, 13), MINT, (16, 64, 46))

    d.text((W // 2, 186), "KinVault", font=font(BOLD, 92), fill=WHITE, anchor="ma")
    d.text(
        (W // 2, 300),
        "The family vault that grows with your household.",
        font=font(REG, 24),
        fill=MUTED,
        anchor="ma",
    )

    # URL card
    card_w, card_h = 640, 118
    cx = (W - card_w) // 2
    cy = 376
    d.rounded_rectangle([(cx, cy), (cx + card_w, cy + card_h)], radius=18, fill=CARD, outline=(31, 92, 70))
    d.text((W // 2, cy + 24), "TRY THE DEMO", font=font(SEMI, 12), fill=GREEN, anchor="ma")
    d.text(
        (W // 2, cy + 48),
        "kinvault-six.vercel.app",
        font=font(MONO_B, 30),
        fill=WHITE,
        anchor="ma",
    )

    d.text(
        (W // 2, 532),
        "github.com/MaxisAlexander/KinVault",
        font=font(MONO, 17),
        fill=MINT,
        anchor="ma",
    )

    stats = [("58", "automated tests"), ("6", "verified flows"), ("31611", "Mezo Testnet")]
    sx = 246
    for value, label in stats:
        d.text((sx, 612), value, font=font(BOLD, 34), fill=WHITE, anchor="ma")
        d.text((sx, 656), label, font=font(REG, 13), fill=MUTED, anchor="ma")
        sx += 264

    d.line([(360, 716), (W - 360, 716)], fill=(255, 255, 255, 26), width=1)
    d.text(
        (W // 2, 742),
        "Built for the Mezo Buildathon  ·  Wave 2",
        font=font(SEMI, 15),
        fill=DIM,
        anchor="ma",
    )
    d.text(
        (W // 2, 774),
        "Bitcoin and MUSD owned together — with rules everyone agreed on.",
        font=font(REG, 15),
        fill=MUTED,
        anchor="ma",
    )

    img.save(os.path.join(OUT, "close.png"))


if __name__ == "__main__":
    arch()
    close()
    print("wrote", os.path.join(OUT, "arch.png"))
    print("wrote", os.path.join(OUT, "close.png"))
