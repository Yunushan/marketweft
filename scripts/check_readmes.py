"""Verify complete, internally linked README editions and shared runnable examples."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = (
    "en", "zh-Hans", "hi", "es", "ar", "fr", "bn", "pt", "id", "ur",
    "ru", "de", "ja", "pcm", "arz", "mr", "vi", "te", "sw", "ha", "tr",
)
MARKER = re.compile(r"^<!-- section:(\d{2}) -->\n## (.+)$", re.MULTILINE)
FENCE = re.compile(r"^```([a-z]+)\n(.*?)^```$", re.MULTILINE | re.DOTALL)
LINK = re.compile(r"\]\(([^)\s]+)\)")
PARAGRAPHS = (2, 1, 41, 3, 2, 2, 2, 1, 2, 2, 2)


def path_for(tag):
    return ROOT / ("README.md" if tag == "en" else f"docs/readme/README.{tag}.md")


def sections(source):
    markers = list(MARKER.finditer(source))
    assert tuple(int(marker[1]) for marker in markers) == tuple(range(1, 12))
    return [(marker[2], source[marker.end():markers[i + 1].start() if i + 1 < len(markers) else None])
            for i, marker in enumerate(markers)]


def links(path, content):
    targets = []
    for target in LINK.findall(content):
        if target.startswith(("https://", "http://")):
            targets.append(target)
            continue
        local = (path.parent / target.split("#", 1)[0]).resolve()
        assert local.is_relative_to(ROOT) and local.exists(), f"{path.name} has broken link {target}"
        targets.append(local.relative_to(ROOT).as_posix())
    return targets


def main():
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    canonical = sections(path_for("en").read_text(encoding="utf-8"))
    expected = {path_for(tag) for tag in LANGUAGES}
    assert {path_for("en"), *(ROOT / "docs/readme").glob("README.*.md")} == expected
    for tag in LANGUAGES:
        path = path_for(tag)
        source = path.read_text(encoding="utf-8")
        assert source.startswith(f"<!-- MarketWeft README · locale={tag} -->\n\n# MarketWeft\n")
        assert f"**{version} · 0BSD**" in source, path.name
        front = source.split("<!-- section:01 -->", 1)[0]
        assert set(links(path, front)) == {(p.relative_to(ROOT).as_posix()) for p in expected - {path}}, path.name
        for i, (heading, body) in enumerate(sections(source)):
            original_heading, original_body = canonical[i]
            assert tag == "en" or heading != original_heading, (path.name, heading)
            assert FENCE.findall(body) == FENCE.findall(original_body), (path.name, heading, "examples")
            assert links(path, body) == links(path_for("en"), original_body), (path.name, heading, "links")
            prose = FENCE.sub("", body)
            parts = [part.strip() for part in prose.split("\n\n") if part.strip()
                     and not part.strip().startswith(("[", "<div", "</div"))]
            assert len(parts) == PARAGRAPHS[i], (path.name, heading, "paragraphs")
            assert all(len(part) >= 70 for part in parts), (path.name, heading, "empty translation")
            if tag != "en":
                assert all(part not in original_body for part in parts), (path.name, heading, "untranslated prose")
    print(f"Verified {len(LANGUAGES)} complete README editions, each with {len(canonical)} matching sections, shared examples and valid local navigation.")


if __name__ == "__main__":
    main()
