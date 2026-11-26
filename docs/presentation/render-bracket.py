"""Render the saved SolidFrame bracket to desktop and mobile proof sheets.

Run with an output directory for the SVGs, then rasterize at 2× in Chromium.
All measured labels and hole geometry come from the saved fabrication node.
"""

import argparse
import json
import math
from pathlib import Path


def points(vertices):
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in vertices)


def polygon(vertices, fill, stroke="#a4bfc6", width=1.1):
    return f'<polygon points="{points(vertices)}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def label(x, y, text, size=14, fill="#b3c8ca", weight=500, anchor="start"):
    return (
        f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" '
        f'fill="{fill}" text-anchor="{anchor}">{text}</text>'
    )


def line(x, y, x2, y2, color="#35515b", width=1):
    return f'<path d="M{x} {y}L{x2} {y2}" stroke="{color}" stroke-width="{width}" fill="none"/>'


def centers(p, face):
    """Mirror the application's centered grid within the usable flange span."""
    grid = p[face]
    span = p["length"] if face == "horizontal" else p["height"]
    if not grid["enabled"]:
        return []
    start_x = (p["width"] - (grid["columns"] - 1) * grid["pitchX"]) / 2
    start_y = (span + p["thickness"] - (grid["rows"] - 1) * grid["pitchY"]) / 2
    return [
        (start_x + col * grid["pitchX"], start_y + row * grid["pitchY"])
        for row in range(grid["rows"])
        for col in range(grid["columns"])
    ]


def isometric(p, x, y, scale):
    w, d, h, t = (p[k] for k in ("width", "length", "height", "thickness"))

    def project(v):
        a, b, c = v
        return (
            x + scale * (a - b) / math.sqrt(2),
            y + scale * (a + b - 2 * c) / math.sqrt(6),
        )

    def surface(vertices, color):
        return polygon([project(v) for v in vertices], color)

    def bores(flange):
        radius = p[flange]["diameter"] / 2
        cutouts = []
        for cx, cy in centers(p, flange):
            circle = [
                (cx + radius * math.cos(math.tau * i / 64), cy + radius * math.sin(math.tau * i / 64))
                for i in range(64)
            ]
            points3 = (
                [(a, b, t) for a, b in circle]
                if flange == "horizontal"
                else [(a, t, b) for a, b in circle]
            )
            cutouts.append(polygon([project(v) for v in points3], "url(#bore)", "#15323d", 1.15))
        return "".join(cutouts)

    # The camera looks from positive x, y and z. Only its visible planar faces are drawn.
    return "".join(
        [
            surface([(w, 0, 0), (w, d, 0), (w, d, t), (w, t, t), (w, t, h), (w, 0, h)], "#365765"),
            surface([(0, d, 0), (w, d, 0), (w, d, t), (0, d, t)], "#587781"),
            surface([(0, t, t), (w, t, t), (w, d, t), (0, d, t)], "url(#deck)"),
            surface([(0, t, t), (w, t, t), (w, t, h), (0, t, h)], "url(#upright)"),
            surface([(0, 0, h), (w, 0, h), (w, t, h), (0, t, h)], "#a8c0c4"),
            bores("horizontal"),
            bores("vertical"),
        ]
    )


def flange_view(p, face, x, y, scale):
    w, t = p["width"], p["thickness"]
    horizontal = face == "horizontal"
    span = p["length"] if horizontal else p["height"]
    grid = p[face]
    title = "Plan · horizontal flange" if horizontal else "Elevation · vertical flange"
    delimited = [label(x, y - 10, title, 15, "#e8f3ef", 600)]
    feet = y if horizontal else y + (span - t) * scale
    delimited.append(
        f'<rect x="{x}" y="{y}" width="{w * scale}" height="{span * scale}" '
        'fill="#1e3741" stroke="#69898d"/>'
    )
    delimited.append(f'<rect x="{x}" y="{feet}" width="{w * scale}" height="{t * scale}" fill="#d8ab61"/>')
    radius = grid["diameter"] * scale / 2
    for cx, cy in centers(p, face):
        px = x + cx * scale
        py = y + (cy if horizontal else span - cy) * scale
        delimited.append(f'<circle cx="{px}" cy="{py}" r="{radius}" fill="#0e2029" stroke="#c1d5d4"/>')
        delimited.append(line(px - radius - 2, py, px + radius + 2, py, "#73a6aa"))
        delimited.append(line(px, py - radius - 2, px, py + radius + 2, "#73a6aa"))
    delimited.append(
        label(
            x, y + span * scale + 19,
            f'{w:g} × {span:g} mm  /  pitch {grid["pitchX"]:g} × {grid["pitchY"]:g} mm',
            12,
        )
    )
    return "".join(delimited)


def render(p, mobile):
    width, height = (430, 891) if mobile else (960, 566)
    ortho_x, ortho_a, ortho_b = (82, 484, 713) if mobile else (679, 133, 366)
    draw_x, draw_y, draw_scale = (190, 232, 2.25) if mobile else (275, 270, 3.15)
    scale = 2.2
    diagram = """
      <defs>
        <linearGradient id="deck" x2="0.8" y2="1">
          <stop stop-color="#b0cacb"/><stop offset="1" stop-color="#7cabb0"/>
        </linearGradient>
        <linearGradient id="upright" x2="0.6" y2="1">
          <stop stop-color="#8bb0b6"/><stop offset="1" stop-color="#608b9a"/>
        </linearGradient>
        <linearGradient id="bore" x2="0.2" y2="1">
          <stop stop-color="#132c37"/><stop offset="0.55" stop-color="#284955"/><stop offset="1" stop-color="#426471"/>
        </linearGradient>
        <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0H0V22" fill="none" stroke="#24404a" stroke-width="1"/>
        </pattern>
      </defs>"""
    art_width = width - 36 if mobile else 604
    art_height = 351 if mobile else 454
    title_x = 25 if mobile else 34
    pieces = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="system-ui, sans-serif">',
        diagram,
        f'<rect width="{width}" height="{height}" rx="12" fill="#0f2028"/>',
        label(title_x, 51, "A bracket with two hole grids", 26 if mobile else 33, "#eef5ef", 650),
        label(
            title_x, 77,
            f'One editable solid   /   Ø{p["horizontal"]["diameter"]:g} mm through holes',
            15, "#b7cdca",
        ),
        f'<rect x="18" y="94" width="{art_width}" height="{art_height}" rx="6" fill="url(#grid)"/>',
        isometric(p, draw_x, draw_y, draw_scale),
        label(title_x + 12, 414 if mobile else 514, "Isometric", 15, "#eef5ef", 600),
        label(
            title_x + 12, 435 if mobile else 535,
            f'{p["width"]:g} × {p["length"]:g} × {p["height"]:g} mm  /  {p["thickness"]:g} mm stock',
            13,
        ),
        flange_view(p, "horizontal", ortho_x, ortho_a, scale),
        flange_view(p, "vertical", ortho_x, ortho_b, scale),
        '</svg>',
    ]
    return "\n".join(pieces) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    native = Path(__file__).with_name("drilled-bracket.cd")
    document = json.loads(native.read_text(encoding="utf-8"))
    models = document["models"]["nodes"]
    node = next(model for model in models if model["__cla$$__"] == "FabricationPartNode")
    parameters = json.loads(node["parametersJson"])
    if parameters["kind"] != "bracket":
        raise ValueError("Expected one native right-angle bracket")
    if parameters["horizontal"]["diameter"] != parameters["vertical"]["diameter"]:
        raise ValueError("This illustration captions the two equal-diameter grids together")
    args.output.mkdir(parents=True, exist_ok=True)
    for mobile, name in [(False, "bracket"), (True, "bracket-mobile")]:
        (args.output / f"{name}.svg").write_text(render(parameters, mobile), encoding="utf-8")


if __name__ == "__main__":
    main()
