"""
Sovelluskuvakkeiden generointi (PLAN.md vaihe 0, PWA).

Miksi skripti eikä käsin tehdyt tiedostot: kuvake on sama merkki kuin
`public/favicon.svg` — tumma pohja ja kaksi samankokoista neliötä, yksi
kummallekin osapuolelle. Jos merkki joskus muuttuu, kaikki koot on saatava
uusiksi yhdellä ajolla, eikä yksikään saa jäädä vanhaksi.

    python scripts/generate-icons.py

Vaatii Pillow'n. Ajetaan harvoin ja käsin, joten sitä ei ole projektin
riippuvuuksissa — kuvakkeet ovat versionhallinnassa valmiina.

KOLME ERI TARKOITUSTA, KOLME ERI RAJAUSTA

- `any`: pyöristetty neliö, kuvake sellaisenaan.
- `maskable`: Android rajaa kuvakkeen oman muotonsa mukaan (ympyrä, neliö,
  pisara). Tausta on siksi reunasta reunaan ja sisältö mahtuu keskimmäiseen
  80 %:iin — muuten laitteen rajaus leikkaisi merkin.
- Apple touch icon: iOS pyöristää kuvakkeen itse eikä tue läpinäkyvyyttä,
  joten tausta on täysi neliö ilman omaa pyöristystä.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

INK = (27, 42, 65, 255)  # #1B2A41
SKY = (61, 139, 255, 255)  # #3D8BFF
CORAL = (255, 111, 89, 255)  # #FF6F59

# Reunanpehmennys: piirretään nelinkertaisena ja pienennetään.
SUPERSAMPLE = 4

PUBLIC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")


def draw_icon(size: int, *, rounded: bool, content_scale: float) -> Image.Image:
    """Piirtää kuvakkeen. `content_scale` on merkin osuus koko kuvasta."""
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if rounded:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=INK)
    else:
        draw.rectangle([0, 0, big - 1, big - 1], fill=INK)

    # Merkin mitat suhteessa 100 x 100 -ruudukkoon (sama kuin favicon.svg):
    # neliöt 24 x 24, y = 38, x = 22 ja 54. y = 38 asettaa neliöiden
    # keskikohdan tasan 50:een; favicon.svg:n 42 näytti isossa koossa siltä,
    # että merkki valuu alaspäin.
    unit = big * content_scale / 100
    offset = (big - unit * 100) / 2

    def square(x: float, colour: tuple[int, int, int, int]) -> None:
        left = offset + x * unit
        top = offset + 38 * unit
        draw.rounded_rectangle(
            [left, top, left + 24 * unit, top + 24 * unit],
            radius=int(5 * unit),
            fill=colour,
        )

    # Neliöt ovat tarkoituksella samankokoiset: kumpikaan osapuoli ei ole
    # toista suurempi (CLAUDE.md kohta 5).
    square(22, SKY)
    square(54, CORAL)

    return image.resize((size, size), Image.LANCZOS)


def save(image: Image.Image, name: str, *, opaque: bool = False) -> None:
    path = os.path.join(PUBLIC, name)
    if opaque:
        background = Image.new("RGB", image.size, INK[:3])
        background.paste(image, mask=image.split()[3])
        background.save(path, "PNG", optimize=True)
    else:
        image.save(path, "PNG", optimize=True)
    print(name, os.path.getsize(path), "tavua")


def main() -> None:
    save(draw_icon(192, rounded=True, content_scale=1.0), "icon-192.png")
    save(draw_icon(512, rounded=True, content_scale=1.0), "icon-512.png")
    # Maskable: tausta reunasta reunaan, sisältö 80 %:n turva-alueelle.
    save(draw_icon(512, rounded=False, content_scale=0.8), "icon-maskable-512.png")
    # iOS ei tue läpinäkyvyyttä kotivalikon kuvakkeessa.
    save(draw_icon(180, rounded=False, content_scale=1.0), "apple-touch-icon.png", opaque=True)


if __name__ == "__main__":
    main()
