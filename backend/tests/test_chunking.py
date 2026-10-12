"""The chunker: body text only, whole paragraphs, no overlap, within the token limit."""

from pathlib import Path

from rag.chunking import MAX_TOKENS, TARGET_WORDS, TextChunk, chunk_book
from tests.epub_factory import Chapter, build_epub


def words_as_tokens(text: str) -> int:
    return len(text.split())


def double_tokens(text: str) -> int:
    """Two tokens a word, so the token limit bites before the word target does."""
    return 2 * len(text.split())


def para(count: int, tag: str) -> str:
    """A paragraph of `count` distinct words, so lost or repeated text is easy to spot."""
    return "<p>" + " ".join(f"{tag}{i}" for i in range(count)) + "</p>"


def book(tmp_path: Path, *chapters: Chapter, **kwargs) -> Path:
    return build_epub(tmp_path / "book.epub", chapters=list(chapters), **kwargs)


def all_words(chunks: list[TextChunk]) -> list[str]:
    return [word for chunk in chunks for word in chunk.text.split()]


def test_only_bodymatter_is_chunked(tmp_path: Path) -> None:
    path = book(
        tmp_path,
        Chapter("title.xhtml", para(5, "front"), epub_type="frontmatter"),
        Chapter("one.xhtml", para(30, "body"), epub_type="bodymatter z3998:fiction"),
        Chapter("notes.xhtml", para(5, "back"), epub_type="backmatter"),
    )

    assert all_words(chunk_book(path, words_as_tokens)) == [f"body{i}" for i in range(30)]


def test_a_book_without_labels_keeps_all_but_the_nav(tmp_path: Path) -> None:
    path = book(
        tmp_path,
        Chapter("one.xhtml", para(10, "a"), epub_type=None, title="Contents entry"),
        Chapter("two.xhtml", para(10, "b"), epub_type=None),
        nav_in_spine=True,
    )

    words = all_words(chunk_book(path, words_as_tokens))

    assert words == [f"a{i}" for i in range(10)] + [f"b{i}" for i in range(10)]


def test_chunks_reach_the_target_before_closing(tmp_path: Path) -> None:
    path = book(tmp_path, Chapter("one.xhtml", "".join(para(60, f"p{n}_") for n in range(20))))

    chunks = chunk_book(path, words_as_tokens)

    assert all(chunk.word_count >= TARGET_WORDS for chunk in chunks[:-1])
    assert all(chunk.token_count <= MAX_TOKENS for chunk in chunks)


def test_the_token_limit_closes_a_chunk_first(tmp_path: Path) -> None:
    path = book(tmp_path, Chapter("one.xhtml", "".join(para(60, f"p{n}_") for n in range(20))))

    chunks = chunk_book(path, double_tokens)

    assert all(chunk.token_count <= MAX_TOKENS for chunk in chunks)
    assert max(chunk.word_count for chunk in chunks) < TARGET_WORDS


def test_no_chunk_crosses_a_chapter(tmp_path: Path) -> None:
    path = book(tmp_path, Chapter("one.xhtml", para(40, "a")), Chapter("two.xhtml", para(40, "b")))

    chunks = chunk_book(path, words_as_tokens)

    assert [chunk.text.split()[0] for chunk in chunks] == ["a0", "b0"]
    assert [chunk.spine_index for chunk in chunks] == [0, 1]


def test_no_text_is_lost_or_repeated(tmp_path: Path) -> None:
    paragraphs = [para(37 + 11 * n, f"p{n}_") for n in range(15)]
    path = book(tmp_path, Chapter("one.xhtml", "".join(paragraphs)))

    expected = [f"p{n}_{i}" for n in range(15) for i in range(37 + 11 * n)]
    assert all_words(chunk_book(path, words_as_tokens)) == expected


def test_a_long_paragraph_is_split_at_a_sentence_end(tmp_path: Path) -> None:
    sentence = " ".join(["word"] * 49) + " end."
    path = book(tmp_path, Chapter("one.xhtml", "<p>" + " ".join([sentence] * 12) + "</p>"))

    chunks = chunk_book(path, words_as_tokens)

    assert len(chunks) > 1
    assert all(c.token_count <= MAX_TOKENS and c.text.endswith("end.") for c in chunks)


def test_a_sentence_over_the_limit_is_split_by_words(tmp_path: Path) -> None:
    path = book(tmp_path, Chapter("one.xhtml", para(1000, "w")))

    chunks = chunk_book(path, words_as_tokens)

    assert all(chunk.token_count <= MAX_TOKENS for chunk in chunks)
    assert all_words(chunks) == [f"w{i}" for i in range(1000)]


def test_headings_and_note_references_are_not_text(tmp_path: Path) -> None:
    body = (
        '<section epub:type="chapter"><hgroup><h2>I</h2><p epub:type="title">Spring</p></hgroup>'
        '<p>Mr. McCunn<a href="notes.xhtml#n1" epub:type="noteref">1</a> walked.</p>'
        "<p>One line<br/>and the next.</p></section>"
    )
    path = book(tmp_path, Chapter("one.xhtml", body))

    [chunk] = chunk_book(path, words_as_tokens)

    assert chunk.text == "Mr. McCunn walked.\n\nOne line and the next."


def test_a_part_title_page_gives_no_chunk(tmp_path: Path) -> None:
    part = '<section epub:type="part"><hgroup><h2>Part I</h2></hgroup></section>'
    path = book(tmp_path, Chapter("part-1.xhtml", part), Chapter("one.xhtml", para(20, "a")))

    chunks = chunk_book(path, words_as_tokens)

    assert [(chunk.position, chunk.spine_index) for chunk in chunks] == [(0, 1)]


def test_empty_paragraphs_give_no_text(tmp_path: Path) -> None:
    body = '<p> </p><p><a epub:type="noteref" href="n.xhtml#1">2</a></p>' + para(20, "a")
    path = book(tmp_path, Chapter("one.xhtml", body))

    [chunk] = chunk_book(path, words_as_tokens)

    assert chunk.text == " ".join(f"a{i}" for i in range(20))


def test_a_table_row_is_one_paragraph(tmp_path: Path) -> None:
    body = "<table><tr><td>Year</td><td>1910</td></tr><tr><td>Cost</td><td>£4</td></tr></table>"
    path = book(tmp_path, Chapter("one.xhtml", body))

    [chunk] = chunk_book(path, words_as_tokens)

    assert chunk.text == "Year 1910\n\nCost £4"


def test_chapter_titles_come_from_the_nav_then_the_heading(tmp_path: Path) -> None:
    path = book(
        tmp_path,
        Chapter("one.xhtml", "<h2>Heading One</h2>" + para(20, "a"), title="Nav One"),
        Chapter("two.xhtml", "<h2>Heading Two</h2>" + para(20, "b")),
    )

    titles = [chunk.chapter_title for chunk in chunk_book(path, words_as_tokens)]

    assert titles == ["Nav One", "Heading Two"]


def test_positions_count_up_across_the_book(tmp_path: Path) -> None:
    path = book(
        tmp_path, Chapter("one.xhtml", para(600, "a")), Chapter("two.xhtml", para(600, "b"))
    )

    chunks = chunk_book(path, words_as_tokens)

    assert [chunk.position for chunk in chunks] == list(range(len(chunks)))


def test_counts_describe_the_chunk_text(tmp_path: Path) -> None:
    path = book(tmp_path, Chapter("one.xhtml", para(30, "a") + para(20, "b")))

    [chunk] = chunk_book(path, double_tokens)

    assert chunk.word_count == 50
    assert chunk.token_count == double_tokens(chunk.text)
