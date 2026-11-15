"""Render the KinVault pitch deck as 1920x1080 pages and a PDF.

Run: python docs/deck/make_deck.py
"""

from __future__ import annotations

import os

import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "slides")
CAP = os.path.join(ROOT, "docs", "video", "captures")
SHOTS = os.path.join(ROOT, "docs", "screenshots")
ARCH = os.path.join(ROOT, "docs", "video", "slides", "arch.png")
HERO = os.path.join(ROOT, "public", "media", "kinvault-family-hero.jpg")
os.makedirs(OUT, exist_ok=True)

W, H = 1920, 1080
M = 100

FONT_DIR = r"C:\Windows\Fonts"
BOLD = os.path.join(FONT_DIR, "segoeuib.ttf")
SEMI = os.path.join(FONT_DIR, "seguisb.ttf")
REG = os.path.join(FONT_DIR, "segoeui.ttf")
MONO = os.path.join(FONT_DIR, "consola.ttf")
MONO_B = os.path.join(FONT_DIR, "consolab.ttf")

GREEN = (52, 211, 153)
MINT = (167, 243, 208)
WHITE = (240, 250, 245)
MUTED = (154, 182, 168)
DIM = (96, 126, 111)
CARD = (9, 32, 24)
CARD2 = (12, 43, 33)
BORDER = (33, 78, 61)
DARK = (4, 15, 11)


def f(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def background() -> Image.Image:
    top, bottom = (5, 17, 12), (10, 35, 26)
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    img = grad.resize((W, H)).convert("RGBA")

    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 48):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 6))
    for y in range(0, H, 48):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 6))
    img = Image.alpha_composite(img, grid)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(W - 700, -380), (W + 300, 520)], fill=(16, 185, 129, 44))
    gd.ellipse([(-380, H - 460), (460, H + 260)], fill=(5, 150, 105, 26))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    return Image.alpha_composite(img, glow).convert("RGB")


def wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        if not para:
            lines.append("")
            continue
        words = para.split()
        cur = ""
        for word in words:
            trial = f"{cur} {word}".strip()
            if draw.textlength(trial, font=font) <= width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    return lines


def paragraph(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    text: str,
    font,
    fill,
    leading: int,
) -> int:
    lines = wrap(draw, text, font, width)
    for i, line in enumerate(lines):
        draw.text((x, y + i * leading), line, font=font, fill=fill)
    return y + len(lines) * leading


def pill(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    font,
    fg,
    bg,
    border=None,
    pad_x: int = 18,
    pad_y: int = 10,
) -> tuple[int, int]:
    tw = draw.textlength(text, font=font)
    h = font.size + pad_y * 2
    draw.rounded_rectangle(
        [(x, y), (x + tw + pad_x * 2, y + h)],
        radius=h // 2,
        fill=bg,
        outline=border,
        width=1 if border else 0,
    )
    draw.text((x + pad_x, y + pad_y - 1), text, font=font, fill=fg)
    return int(x + tw + pad_x * 2), h


def logo(draw: ImageDraw.ImageDraw, x: int, y: int, size: int = 44) -> None:
    draw.rounded_rectangle(
        [(x, y), (x + size, y + size)], radius=int(size * 0.3), fill=(16, 122, 88)
    )
    cx = x + size / 2
    cy = y + size / 2
    s = size * 0.24
    draw.polygon(
        [(cx, cy - s * 1.05), (cx + s, cy - s * 0.1), (cx - s, cy - s * 0.1)],
        fill=WHITE,
    )
    draw.rectangle(
        [(cx - s * 0.72, cy - s * 0.15), (cx + s * 0.72, cy + s * 0.85)],
        fill=WHITE,
    )
    draw.rectangle(
        [(cx - s * 0.22, cy + s * 0.25), (cx + s * 0.22, cy + s * 0.85)],
        fill=(16, 122, 88),
    )


def header(draw: ImageDraw.ImageDraw, eyebrow: str, page: int, total: int) -> None:
    logo(draw, M, 58, 42)
    draw.text((M + 58, 66), "KinVault", font=f(BOLD, 26), fill=WHITE)
    draw.text(
        (W - M, 72),
        "MEZO BUILDATHON  ·  WAVE 2",
        font=f(MONO, 13),
        fill=DIM,
        anchor="ra",
    )
    draw.line([(M, 130), (W - M, 130)], fill=(255, 255, 255, 20), width=1)
    draw.text(
        (M, 1032),
        "kinvault-six.vercel.app",
        font=f(MONO, 13),
        fill=DIM,
    )
    draw.text(
        (W - M, 1032),
        f"{page:02d} / {total:02d}",
        font=f(MONO, 13),
        fill=DIM,
        anchor="ra",
    )


def eyebrow(draw: ImageDraw.ImageDraw, text: str, y: int = 170) -> None:
    draw.text((M, y), text.upper(), font=f(MONO_B, 14), fill=GREEN)


def slide_title(draw: ImageDraw.ImageDraw, text: str, y: int = 210, size: int = 62) -> int:
    lines = wrap(draw, text, f(BOLD, size), W - 2 * M)
    for i, line in enumerate(lines):
        draw.text((M, y + i * int(size * 1.12)), line, font=f(BOLD, size), fill=WHITE)
    return y + len(lines) * int(size * 1.12)


def card(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int = 20,
    fill=CARD,
    outline=BORDER,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=1)


def number_badge(draw: ImageDraw.ImageDraw, x: int, y: int, n: int, r: int = 22) -> None:
    draw.ellipse([(x - r, y - r), (x + r, y + r)], fill=(16, 64, 46), outline=BORDER)
    draw.text((x, y - 1), f"{n:02d}", font=f(MONO_B, 13), fill=MINT, anchor="mm")


def draw_check(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    size: float = 6,
    color=GREEN,
    width: int = 3,
) -> None:
    draw.line(
        [(cx - size, cy), (cx - size * 0.15, cy + size * 0.8), (cx + size, cy - size * 0.75)],
        fill=color,
        width=width,
        joint="curve",
    )


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [(0, 0), (size[0] - 1, size[1] - 1)], radius=radius, fill=255
    )
    return m


def screenshot(
    img: Image.Image,
    path: str,
    box: tuple[int, int, int, int],
    radius: int = 18,
    cover: bool = True,
    focus: float = 0.5,
    border: bool = True,
) -> None:
    x, y, w, h = box
    src = Image.open(path).convert("RGB")
    if cover:
        src = ImageOps.fit(src, (w, h), method=Image.Resampling.LANCZOS, centering=(0.5, focus))
    else:
        src = ImageOps.contain(src, (w, h), method=Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    layer.paste(src, ((w - src.width) // 2, (h - src.height) // 2))
    img.paste(layer, (x, y), rounded_mask((w, h), radius))
    if border:
        d = ImageDraw.Draw(img)
        d.rounded_rectangle(
            [(x, y), (x + w - 1, y + h - 1)], radius=radius, outline=BORDER, width=1
        )


def label_bar(
    img: Image.Image,
    box: tuple[int, int, int, int],
    title: str,
    sub: str,
    radius: int = 18,
    bar_h: int = 84,
) -> None:
    x, y, w, h = box
    bar = Image.new("RGBA", (w, bar_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    for i in range(bar_h):
        alpha = int(238 * (i / (bar_h - 1)) ** 0.7)
        bd.line([(0, i), (w, i)], fill=(4, 16, 11, alpha))
    img.paste(bar, (x, y + h - bar_h), rounded_mask((w, bar_h), radius))
    d = ImageDraw.Draw(img)
    d.text((x + 22, y + h - 48), title, font=f(SEMI, 19), fill=WHITE)
    d.text((x + 22, y + h - 24), sub, font=f(MONO, 11), fill=MUTED)


def save(img: Image.Image, name: str) -> str:
    path = os.path.join(OUT, name)
    img.save(path)
    return path


# ------------------------------------------------------------------ slides


def slide_title_page(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)

    # Hero image card.
    hero_box = (1070, 150, 750, 780)
    hx, hy, hw, hh = hero_box
    src = Image.open(HERO).convert("RGB")
    src = ImageOps.fit(src, (hw, hh), method=Image.Resampling.LANCZOS, centering=(0.52, 0.42))
    layer = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    layer.paste(src, (0, 0))
    img.paste(layer, (hx, hy), rounded_mask((hw, hh), 30))
    d.rounded_rectangle(
        [(hx, hy), (hx + hw - 1, hy + hh - 1)], radius=30, outline=(40, 105, 80), width=2
    )

    grad = Image.new("RGBA", (hw, 160), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for i in range(160):
        gd.line([(0, i), (hw, i)], fill=(3, 12, 8, int(190 * (i / 159) ** 0.85)))
    img.paste(grad, (hx, hy + hh - 160), rounded_mask((hw, 160), 30))
    d.text((hx + 30, hy + hh - 70), "The Rivera family", font=f(SEMI, 22), fill=WHITE)
    d.text(
        (hx + 30, hy + hh - 38),
        "Sample vault · six seats · Mezo Testnet",
        font=f(MONO, 13),
        fill=MINT,
    )

    pill(
        d,
        M,
        196,
        "MEZO TESTNET  ·  CHAIN 31611",
        f(MONO_B, 13),
        MINT,
        (16, 64, 46),
        (36, 100, 76),
    )

    d.text((M, 258), "The family vault", font=f(BOLD, 88), fill=WHITE)
    d.text((M, 356), "for Bitcoin & MUSD.", font=f(BOLD, 88), fill=WHITE)

    paragraph(
        d,
        M,
        492,
        820,
        "Pool BTC and MUSD as a household. Spend with approvals, borrow without "
        "selling, and lock savings for the kids.",
        f(REG, 26),
        MUTED,
        38,
    )

    x, _ = pill(
        d,
        M,
        640,
        "kinvault-six.vercel.app",
        f(MONO_B, 20),
        (6, 20, 15),
        GREEN,
    )
    d.text((x + 18, 648), "TRY THE DEMO", font=f(MONO, 12), fill=DIM)
    d.text(
        (M, 706),
        "github.com/MaxisAlexander/KinVault",
        font=f(MONO, 17),
        fill=MINT,
    )

    stats = [("6", "family seats"), ("2-of-N", "spending approvals"), ("BTC", "collateral, never sold")]
    sx = M
    for value, label in stats:
        d.text((sx, 800), value, font=f(BOLD, 34), fill=WHITE)
        d.text((sx, 844), label, font=f(REG, 14), fill=MUTED)
        sx += 270
    d.line([(M, 908), (M + 760, 908)], fill=(255, 255, 255, 22), width=1)
    d.text(
        (M, 930),
        "Mezo Buildathon  ·  Wave 2  ·  November 2026",
        font=f(SEMI, 15),
        fill=DIM,
    )
    return img


def slide_problem(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "The problem", 2, total)
    eyebrow(d, "The problem")
    slide_title(d, "Bitcoin is the family savings.\nLife keeps asking for cash.", 200, 60)

    paragraph(
        d,
        M,
        372,
        1040,
        "Households hold BTC together but manage money apart. The result is invisible "
        "balances, ad-hoc spending, and selling at the worst moment.",
        f(REG, 23),
        MUTED,
        34,
    )

    items = [
        (
            "One person holds the keys",
            "The treasury sits in a single wallet. Nobody else can see the balance, the history, or what is coming.",
        ),
        (
            "Spending has no guardrails",
            "No shared approvals, no per-member limits, no receipts. Money leaves, then the conversation starts.",
        ),
        (
            "The only liquidity is selling",
            "Tuition, a roof, a medical bill — the fastest route is selling BTC, often at the worst price.",
        ),
    ]
    x = M
    for i, (title, body) in enumerate(items, start=1):
        number_badge(d, x + 24, 592, i)
        d.text((x, 636), title, font=f(SEMI, 26), fill=WHITE)
        paragraph(d, x, 682, 500, body, f(REG, 18), MUTED, 27)
        x += 570

    d.line([(M, 872), (W - M, 872)], fill=(255, 255, 255, 22), width=1)
    d.text(
        (M, 900),
        "Families need a treasury, not another exchange account.",
        font=f(SEMI, 28),
        fill=MINT,
    )
    return img


def slide_solution(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "The product", 3, total)
    eyebrow(d, "The product")
    slide_title(d, "One vault. Six seats.\nRules everyone agreed on.", 200, 56)

    features = [
        (
            "Shared MUSD treasury",
            "One balance the whole household can see, fund, and spend from.",
        ),
        (
            "Two-approval spending",
            "Expenses over $100 need two members. Under $100 clears instantly.",
        ),
        (
            "BTC-backed loans",
            "Mint MUSD against the family's BTC through Mezo. Repay or close the trove.",
        ),
        (
            "Generational lockboxes",
            "Time-locked savings with a letter and two guardian signatures.",
        ),
    ]
    for i, (title, body) in enumerate(features):
        col, row = i % 2, i // 2
        x = M + col * 440
        y = 392 + row * 250
        card(d, (x, y, x + 400, y + 220))
        number_badge(d, x + 34, y + 38, i + 1, 18)
        d.text((x + 24, y + 72), title, font=f(SEMI, 23), fill=WHITE)
        paragraph(d, x + 24, y + 112, 352, body, f(REG, 16), MUTED, 23)

    shot_box = (1000, 360, 820, 566)
    screenshot(img, os.path.join(SHOTS, "02-dashboard.png"), shot_box, 20, cover=True, focus=0.0)
    d.text(
        (1000, 942),
        "The Rivera family dashboard · demo mode",
        font=f(MONO, 12),
        fill=DIM,
    )
    d.text((1000, 966), "Treasury, BTC reserve, loans and every member in one view.", font=f(REG, 15), fill=MUTED)
    return img


def slide_walkthrough(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "Walkthrough", 4, total)
    eyebrow(d, "Walkthrough")
    slide_title(d, "Every household flow, in one place.", 200, 56)
    d.text(
        (W - M, 218),
        "2:19 narrated demo",
        font=f(MONO_B, 14),
        fill=GREEN,
        anchor="ra",
    )

    tiles = [
        (
            os.path.join(CAP, "16-expense-dialog.png"),
            "Spending · approvals",
            "Two members sign off; nobody can approve their own.",
            0.0,
        ),
        (
            os.path.join(CAP, "18-loans.png"),
            "Loans · borrow against BTC",
            "LTV, health factor, stress test, borrow and repay.",
            0.32,
        ),
        (
            os.path.join(CAP, "22-trust.png"),
            "Trust · lockboxes",
            "Milestones, letters, guardian signatures and contributions.",
            0.0,
        ),
        (
            os.path.join(CAP, "27-receipts.png"),
            "Receipts · verify chain",
            "Every action hashed to the one before it.",
            0.0,
        ),
    ]
    for i, (path, title, sub, focus) in enumerate(tiles):
        col, row = i % 2, i // 2
        x = M + col * 860
        y = 300 + row * 360
        w, h = 820, 300
        screenshot(img, path, (x, y, w, h), 18, cover=True, focus=focus)
        label_bar(img, (x, y, w, h), title, sub, 18, bar_h=68)

    return img


def slide_mezo(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "Mezo integration", 5, total)
    eyebrow(d, "Mezo integration")
    slide_title(d, "Bitcoin stays. MUSD does the work.", 200, 58)

    steps = [
        ("Deposit BTC", "The family treasury wallet holds BTC on Mezo Testnet."),
        ("Open a trove", "BorrowerOperations locks collateral and mints MUSD to the vault."),
        ("Use MUSD", "Spend with approvals, fund lockboxes, or keep it as a buffer."),
        ("Repay or close", "repayMUSD burns debt; closeTrove returns the collateral."),
    ]
    line_x = M + 26
    d.line([(line_x, 392), (line_x, 850)], fill=(31, 88, 67), width=2)
    for i, (title, body) in enumerate(steps):
        y = 380 + i * 132
        number_badge(d, line_x, y, i + 1)
        d.text((M + 70, y - 18), title, font=f(SEMI, 25), fill=WHITE)
        paragraph(d, M + 70, y + 18, 720, body, f(REG, 17), MUTED, 25)

    fx, fy, fw, fh = 1050, 320, 770, 600
    card(d, (fx, fy, fx + fw, fy + fh))
    d.text((fx + 34, fy + 30), "Mezo Testnet  ·  31611", font=f(SEMI, 22), fill=WHITE)
    d.line([(fx + 34, fy + 72), (fx + fw - 34, fy + 72)], fill=(255, 255, 255, 20), width=1)
    rows = [
        ("MUSD", "0x1189…c503  ·  18 decimals"),
        ("MEZO", "0x7B7c…0001  ·  18 decimals"),
        ("BTC / USD", "PriceFeed.fetchPrice()"),
        ("MCR", "1.10"),
        ("Gas compensation", "200 MUSD"),
        ("Min net debt", "1,800 MUSD"),
        ("BorrowerOperations", "0xCdF7…beE5"),
    ]
    for i, (k, v) in enumerate(rows):
        y = fy + 100 + i * 60
        d.text((fx + 34, y), k, font=f(MONO, 15), fill=DIM)
        d.text((fx + 300, y), v, font=f(MONO, 15), fill=WHITE)
    d.text(
        (fx + 34, fy + fh - 46),
        "Read live by scripts/mezo-live-check.ts",
        font=f(MONO, 12),
        fill=DIM,
    )
    return img


def slide_security(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "Architecture & security", 6, total)
    eyebrow(d, "Architecture & security")

    screenshot(img, ARCH, (M, 196, 1160, 800), 18, cover=False, border=True)

    x = 1310
    bullets = [
        ("Only the hash is sent", "The browser never posts an amount or a recipient it could invent."),
        ("Receipts are decoded", "Token, sender, recipient, amount, chain and confirmations."),
        ("Replay-proof", "tx_hash is the primary key; a replayed transaction fails."),
        ("No keys held", "The treasury wallet signs. KinVault never custodies funds."),
    ]
    y = 240
    for i, (title, body) in enumerate(bullets, start=1):
        d.ellipse([(x, y - 2), (x + 30, y + 28)], fill=(16, 64, 46), outline=BORDER)
        draw_check(d, x + 15, y + 13, 6)
        d.text((x + 46, y - 4), title, font=f(SEMI, 21), fill=WHITE)
        paragraph(d, x + 46, y + 30, 470, body, f(REG, 16), MUTED, 23)
        y += 176
    return img


def slide_compare(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "Why KinVault", 7, total)
    eyebrow(d, "Why KinVault")
    slide_title(d, "A joint account can't hold Bitcoin.\nAn exchange can't raise a family.", 196, 52)

    x, y = M, 380
    widths = [560, 400, 400, 360]
    heads = ["", "Joint bank account", "Exchange account", "KinVault"]
    for i, head in enumerate(heads):
        cx = x + sum(widths[:i])
        if head:
            d.text((cx + 18, y), head, font=f(SEMI, 18), fill=MUTED)
        else:
            d.text((cx, y), "Capability", font=f(MONO, 13), fill=DIM)
    d.line([(x, y + 40), (W - M, y + 40)], fill=(255, 255, 255, 24), width=1)

    rows = [
        ("Everyone sees the balance", False, True, True),
        ("Two-member spending approvals", False, False, True),
        ("Liquidity without selling BTC", False, False, True),
        ("Lockboxes for the kids", False, False, True),
        ("Keys stay with the family", False, False, True),
    ]
    for r, (label, bank, exch, kv) in enumerate(rows):
        ry = y + 64 + r * 86
        if r % 2 == 0:
            d.rectangle([(x, ry - 10), (W - M, ry + 64)], fill=(13, 42, 32))
        d.text((x + 4, ry + 12), label, font=f(REG, 19), fill=WHITE)
        for i, ok in enumerate([bank, exch, kv]):
            cx = x + sum(widths[: i + 1]) + 18
            if ok:
                d.ellipse([(cx, ry + 6), (cx + 30, ry + 36)], fill=(16, 78, 56))
                draw_check(d, cx + 15, ry + 21, 6)
            else:
                d.text((cx + 15, ry + 21), "—", font=f(REG, 20), fill=(80, 100, 90), anchor="mm")

    d.line([(x, 902), (W - M, 902)], fill=(255, 255, 255, 22), width=1)
    d.text(
        (M, 928),
        "KinVault is the only column with all five.",
        font=f(SEMI, 24),
        fill=MINT,
    )
    return img


def slide_business(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)
    header(d, "Business model & roadmap", 8, total)
    eyebrow(d, "Business model & roadmap")
    slide_title(d, "Small recurring revenue,\naligned with families.", 200, 54)

    cards = [
        ("$5 / month", "per family vault, up to six seats."),
        ("0.25%", "origination fee on MUSD borrowed, proposed."),
        ("Premium", "legacy letters, extra guardians, priority support."),
    ]
    for i, (title, body) in enumerate(cards):
        y = 392 + i * 176
        card(d, (M, y, M + 760, y + 148))
        d.text((M + 28, y + 24), title, font=f(BOLD, 34), fill=GREEN)
        paragraph(d, M + 28, y + 76, 700, body, f(REG, 17), MUTED, 24)
    d.text(
        (M, 940),
        "Proposed pricing — the testnet is free.",
        font=f(MONO, 12),
        fill=DIM,
    )

    tx = 980
    ty = 392
    d.line([(tx + 10, ty + 10), (tx + 10, 900)], fill=(31, 88, 67), width=2)
    roadmap = [
        ("Now", "Mezo Testnet MVP", "Demo + live read path, 58 tests, public repo."),
        ("Q1 2027", "Security review + mainnet beta", "Audit, Safe treasury, monitoring, incident runbook."),
        ("Q2 2027", "Family controls", "Allowances, freeze, mobile app, fiat on-ramp."),
        ("2027+", "Distribution", "Credit unions, Bitcoin wallets and family advisors."),
    ]
    for i, (when, title, body) in enumerate(roadmap):
        y = ty + i * 136
        d.ellipse([(tx + 2, y + 2), (tx + 20, y + 20)], fill=GREEN)
        d.text((tx + 40, y - 4), when, font=f(MONO_B, 12), fill=GREEN)
        d.text((tx + 40, y + 20), title, font=f(SEMI, 21), fill=WHITE)
        paragraph(d, tx + 40, y + 52, 740, body, f(REG, 15), MUTED, 22)
    return img


def slide_close(total: int) -> Image.Image:
    img = background()
    d = ImageDraw.Draw(img)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([(W // 2 - 520, 80), (W // 2 + 520, 720)], fill=(16, 185, 129, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(100))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    d = ImageDraw.Draw(img)

    pill(
        d,
        M,
        168,
        "LIVE ON MEZO TESTNET",
        f(MONO_B, 13),
        MINT,
        (16, 64, 46),
        (36, 100, 76),
    )
    d.text((M, 230), "KinVault", font=f(BOLD, 104), fill=WHITE)
    d.text(
        (M, 356),
        "Bitcoin and MUSD, owned together.",
        font=f(REG, 30),
        fill=MUTED,
    )

    d.text((M, 470), "TRY THE DEMO", font=f(MONO, 12), fill=GREEN)
    d.text(
        (M, 494),
        "kinvault-six.vercel.app",
        font=f(MONO_B, 34),
        fill=WHITE,
    )
    d.text(
        (M, 566),
        "github.com/MaxisAlexander/KinVault",
        font=f(MONO, 19),
        fill=MINT,
    )
    d.text(
        (M, 606),
        "docs/video/kinvault-demo.mp4  ·  2:19 narrated walkthrough",
        font=f(MONO, 14),
        fill=DIM,
    )

    stats = [("58", "automated tests"), ("6", "verified flows"), ("31611", "Mezo Testnet")]
    sx = M
    for value, label in stats:
        d.text((sx, 700), value, font=f(BOLD, 42), fill=WHITE)
        d.text((sx, 754), label, font=f(REG, 14), fill=MUTED)
        sx += 230

    qr = qrcode.QRCode(box_size=12, border=2)
    qr.add_data("https://kinvault-six.vercel.app")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=(6, 22, 16), back_color=(240, 250, 245)).convert("RGB")
    qr_img = qr_img.resize((300, 300), Image.Resampling.NEAREST)
    qx, qy = 1360, 360
    d.rounded_rectangle(
        [(qx - 22, qy - 22), (qx + 322, qy + 322)], radius=24, fill=(240, 250, 245)
    )
    img.paste(qr_img, (qx, qy))
    d.text(
        (qx + 150, qy + 348),
        "Scan to open the demo",
        font=f(SEMI, 16),
        fill=MUTED,
        anchor="ma",
    )

    d.line([(M, 880), (W - M, 880)], fill=(255, 255, 255, 22), width=1)
    d.text(
        (M, 910),
        "Built for the Mezo Buildathon  ·  Wave 2  ·  November 2026",
        font=f(SEMI, 17),
        fill=DIM,
    )
    d.text(
        (W - M, 910),
        "Open source  ·  MIT  ·  Testnet only",
        font=f(MONO, 12),
        fill=DIM,
        anchor="ra",
    )
    return img


def main() -> None:
    pages = [
        ("01-title", slide_title_page(9)),
        ("02-problem", slide_problem(9)),
        ("03-product", slide_solution(9)),
        ("04-walkthrough", slide_walkthrough(9)),
        ("05-mezo", slide_mezo(9)),
        ("06-security", slide_security(9)),
        ("07-compare", slide_compare(9)),
        ("08-business", slide_business(9)),
        ("09-close", slide_close(9)),
    ]
    paths = []
    for name, page in pages:
        path = save(page, f"{name}.png")
        paths.append(path)
        print("wrote", path)

    pdf = os.path.join(HERE, "kinvault-deck.pdf")
    first = Image.open(paths[0]).convert("RGB")
    rest = [Image.open(p).convert("RGB") for p in paths[1:]]
    first.save(
        pdf,
        save_all=True,
        append_images=rest,
        resolution=150.0,
        title="KinVault — Mezo Buildathon Wave 2",
        author="KinVault",
    )
    print("wrote", pdf, f"{os.path.getsize(pdf) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
