from pathlib import Path

CANONICAL_SCRIPT = '<script src="/js/rp-canonical-estimator.js"></script>'


def should_patch(path: Path, text: str) -> bool:
    if '.git' in path.parts:
        return False
    if path.suffix.lower() != '.html':
        return False
    if 'id="rpApp"' not in text and "id='rpApp'" not in text:
        return False
    if CANONICAL_SCRIPT in text:
        return False
    return '</body>' in text


def main() -> None:
    changed = []
    for path in sorted(Path('.').rglob('*.html')):
        text = path.read_text(encoding='utf-8')
        if not should_patch(path, text):
            continue
        text = text.replace('</body>', CANONICAL_SCRIPT + '\n</body>', 1)
        path.write_text(text, encoding='utf-8')
        changed.append(path.as_posix())

    if changed:
        print('Added canonical estimator script to:')
        for item in changed:
            print(f' - {item}')
    else:
        print('No estimator pages needed changes.')


if __name__ == '__main__':
    main()
