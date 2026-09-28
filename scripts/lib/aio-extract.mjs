// In-page extraction of Google's AI Overview (AIO) block on a plain SERP.
// Passed to page.evaluate(), so it must stay fully self-contained — no
// closures over module scope.
//
// Google's class names are obfuscated and rotate, so everything here keys
// off text and aria-labels instead (see docs/youtube-aio-tracker-plan.md §8):
//  - the block starts at a heading whose own text is "AI 개요"/"AI Overview";
//  - the source panel lists each source as <a aria-label="<title>. 새 탭에서
//    열립니다."> in display order → citation order (the collector dedupes
//    links that resolve to the same URL, e.g. a YouTube item's thumbnail);
//  - inline citation chips are the other /goto links inside the answer; a
//    chip belongs to the text right before it → which sentence a source
//    backs;
//  - text collapsed behind "더보기" is already in the DOM, no click needed.
//
// `ignoreVisibility` is only for replaying saved HTML offline (JS disabled),
// where Google's JS-gated CSS leaves every element display:none.
export function extractAioInPage({ ignoreVisibility = false } = {}) {
  const HEADINGS = ["AI 개요", "AI Overview"];
  // Panel links end in "새 탭에서 열립니다"; a panel video item's thumbnail
  // link reads "<제목>, 동영상, <YouTube|사이트>에서 시청" instead.
  const PANEL_SUFFIX = /(\.?\s*(새 탭에서 열립니다|Opens in new tab)\.?|,\s*동영상,\s*.+에서 시청|,\s*Video,\s*Watch on .+)$/i;
  const NOISE = /^(더보기|간략히 보기|간략히|모두 표시|Show more|Show all|Show less|AI 개요|AI Overview)$|AI 모드 대답:?$|AI 개요가 제공되지 않습니다|AI 개요를 생성할 수 없습니다|AI Overview is not available/;
  // Everything after the disclaimer is share/feedback UI, not the answer.
  const STOP = /^(AI 답변에 오류가 있을 수 있습니다|AI responses may include mistakes)/;
  const norm = (v) => (v || "").replace(/\s+/g, " ").trim();
  const isGoto = (a) => /\/goto\?url=|\/url\?/.test(a.getAttribute("href") || "");
  const visible = (el) => ignoreVisibility || typeof el.checkVisibility !== "function" || el.checkVisibility();

  const bodyText = document.body ? document.body.innerText || "" : "";
  if (location.pathname.startsWith("/sorry") || /unusual traffic|비정상적인 트래픽|reCAPTCHA/i.test(bodyText)) {
    return { state: "captcha" };
  }

  const heading = [...document.querySelectorAll("div,span,h1,h2,h3,strong")].find(
    (el) => el.children.length <= 2 && HEADINGS.includes(norm(el.textContent)) && visible(el)
  );
  if (!heading) return { state: "absent" };

  const gotoCount = (el) => [...el.querySelectorAll("a[href]")].filter(isGoto).length;
  // Video card = a single text-less link plus metadata text around it
  // ("4m · 제목 · 조회수 · YouTube · 채널"). Like a chip, it backs the
  // sentence right before it, and its text is not answer text. Some cards
  // also carry the panel's "새 탭에서 열립니다" aria suffix, so they must be
  // told apart (isPanelLink) before the panel is located.
  const cardRoot = (a, boundary) => {
    let root = a;
    // Stop at the first ancestor that holds the whole card ("YouTube · 채널"
    // is its last line) so the lead-in sentence above it stays answer text.
    while (
      !/YouTube\s·/.test(root.textContent || "") &&
      root.parentElement &&
      root.parentElement !== boundary &&
      gotoCount(root.parentElement) === 1 &&
      norm(root.parentElement.textContent).length <= 250
    ) {
      root = root.parentElement;
    }
    // The duration badge ("4m") sits on the thumbnail beside the title block.
    while (
      root.parentElement &&
      root.parentElement !== boundary &&
      gotoCount(root.parentElement) === 1 &&
      norm(root.parentElement.textContent).length - norm(root.textContent).length <= 10
    ) {
      root = root.parentElement;
    }
    return root;
  };
  // Side-panel YouTube items also read "YouTube · 채널", so only the inline
  // card's own aria wording ("<채널>님이 YouTube에 게시한 <제목>") tells the
  // two apart.
  const INLINE_VIDEO_ARIA = /님이 YouTube에 게시한|on YouTube/i;
  const isPanelLink = (a) => {
    const aria = a.getAttribute("aria-label") || "";
    return isGoto(a) && PANEL_SUFFIX.test(aria) && !INLINE_VIDEO_ARIA.test(aria);
  };

  // Climb until the ancestor also holds the source panel.
  let container = heading;
  for (let i = 0; i < 15 && container.parentElement; i++) {
    container = container.parentElement;
    if ([...container.querySelectorAll("a[href]")].some(isPanelLink)) break;
  }

  const anchors = [...container.querySelectorAll("a[href]")].filter(isGoto);
  const panelAnchors = anchors.filter(isPanelLink);
  // A panel item can hold more links to the same source (site label,
  // thumbnail, duration badge); everything inside the item belongs to the
  // panel, not the answer. Item = largest ancestor holding just this one
  // panel link, capped so a lone panel link can't swallow the answer.
  const panelSet = new Set(panelAnchors);
  const panelLinksIn = (el) => [...el.querySelectorAll("a[href]")].filter((a) => panelSet.has(a)).length;
  const itemRoot = (a) => {
    let root = a;
    while (
      root.parentElement &&
      root.parentElement !== container &&
      panelLinksIn(root.parentElement) === 1 &&
      norm(root.parentElement.textContent).length <= 400
    ) {
      root = root.parentElement;
    }
    return root;
  };
  const panelItems = new Set(panelAnchors.map(itemRoot));
  const inPanelItem = (el) => [...panelItems].some((item) => item.contains(el));
  const inlineAnchors = anchors.filter((a) => !inPanelItem(a));
  // Chip = aria-labelled, text-less link (its site label sits in a sibling);
  // inline link = a phrase inside the sentence that is itself a citation.
  // A link whose whole text is a duration ("2:14") is a video thumbnail —
  // a chip, not a phrase of the sentence.
  const DURATION = /^(\d+:)?\d{1,2}:\d{2}$/;
  const isChip = (a) => !norm(a.textContent) || DURATION.test(norm(a.textContent));
  const chipAnchors = inlineAnchors.filter(isChip);
  const textLinkAnchors = inlineAnchors.filter((a) => !isChip(a));
  const chipWrapperOf = (a) => {
    const card = cardRoot(a, container);
    if (/YouTube\s·/.test(card.textContent || "")) return card;
    return a.parentElement && norm(a.parentElement.textContent).length <= 40 ? a.parentElement : a;
  };

  const sources = [];
  const indexByHref = new Map();
  const addSource = (a, title) => {
    const href = a.href;
    if (indexByHref.has(href)) return indexByHref.get(href);
    sources.push({ href, title: norm(title) });
    indexByHref.set(href, sources.length - 1);
    return sources.length - 1;
  };
  for (const a of panelAnchors) addSource(a, (a.getAttribute("aria-label") || "").replace(PANEL_SUFFIX, ""));
  for (const a of inlineAnchors) addSource(a, (a.getAttribute("aria-label") || a.textContent || "").replace(PANEL_SUFFIX, ""));

  // Panel text (titles/snippets) is not part of the answer. Normally the
  // smallest ancestor holding every panel link is the panel itself; if it
  // also holds answer citations (chips, inline links, video cards) it has
  // swallowed the answer, so fall back to excluding each panel item alone
  // (panelItems, above).
  const diagnostics = { panelLinks: panelAnchors.length, inlineLinks: inlineAnchors.length };
  let panelRoot = null;
  if (panelAnchors.length > 0) {
    panelRoot = panelAnchors[0].parentElement;
    while (panelRoot && !panelAnchors.every((a) => panelRoot.contains(a))) panelRoot = panelRoot.parentElement;
    if (panelRoot && (panelRoot.contains(heading) || inlineAnchors.some((a) => panelRoot.contains(a)))) panelRoot = null;
  }
  diagnostics.panelRootUsed = !!panelRoot;

  // Walk the answer in document order: text accumulates into a segment, a
  // run of chips closes it and attaches its sources to it. Block elements
  // (paragraphs, list items) also close a segment.
  const paragraphs = [];
  const textLinkSet = new Set(textLinkAnchors);
  // A chip's wrapper holds the link plus its site label ("Slack", "+1") —
  // treat the whole wrapper as the chip so the label isn't read as answer text.
  const chipWrappers = new Set(chipAnchors.map(chipWrapperOf));
  // Live pages hide hover-card text inside links; innerText respects that.
  const ownText = (el) => (ignoreVisibility ? el.textContent : el.innerText) || "";
  let stopped = false;
  let text = "";
  let refs = [];
  let pendingChip = false;
  const flush = () => {
    const t = norm(text);
    if (STOP.test(t)) stopped = true;
    if (stopped) {
      text = "";
      refs = [];
      pendingChip = false;
      return;
    }
    if (t && !NOISE.test(t)) paragraphs.push({ text: t, sources: [...new Set(refs)] });
    else if (refs.length > 0 && paragraphs.length > 0) {
      const last = paragraphs[paragraphs.length - 1];
      last.sources = [...new Set([...last.sources, ...refs])];
    }
    text = "";
    refs = [];
    pendingChip = false;
  };
  const boundary = () => {
    if (pendingChip || norm(text)) flush();
  };
  const skip = (el) =>
    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) ||
    el === heading ||
    panelItems.has(el) ||
    (panelRoot && panelRoot.contains(el)) ||
    !visible(el);
  const isBlock = (el) => ["P", "LI", "UL", "OL", "H1", "H2", "H3", "H4"].includes(el.tagName) || (!ignoreVisibility && ["block", "list-item", "flex", "grid"].includes(getComputedStyle(el).display)) ||
    (ignoreVisibility && el.tagName === "DIV");

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (stopped) return;
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent || "";
        // "+1" next to a chip = more sources behind it, not answer text.
        if (!norm(t) || /^\+\d+$/.test(norm(t))) continue;
        if (pendingChip) flush();
        text += ` ${t}`;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (chipWrappers.has(child)) {
        const chips = child.tagName === "A" ? [child] : [...child.querySelectorAll("a[href]")].filter(isGoto);
        for (const a of chips) refs.push(indexByHref.get(a.href));
        pendingChip = true;
        continue;
      }
      if (textLinkSet.has(child)) {
        if (pendingChip) flush();
        refs.push(indexByHref.get(child.href));
        text += ` ${ownText(child)}`;
        continue;
      }
      if (skip(child)) continue;
      const block = isBlock(child);
      if (block) boundary();
      walk(child);
      if (block) boundary();
    }
  };
  walk(container);
  flush();

  const aioText = paragraphs.map((p) => p.text).join("\n");
  return { state: "present", aioText, paragraphs, sources, diagnostics };
}
