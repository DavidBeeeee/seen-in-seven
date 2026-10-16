// Solution Vault: Book Shelf, in-Studio Readers, and Video Room.
// WBR-445, 2026-10-16.

let vaultContext = null;
let vaultItems = [];
let vaultProgress = new Map();
let vaultBooks = [];
let activeBook = null;

// Reader state
let pdfDoc = null;
let currentPdfPage = 1;
let pdfScale = 1.0;
let pdfRendering = false;
let pdfPendingPage = null;
let pdfSaveTimer = null;
let currentWebChapterIdx = 0;

const vaultEl = id => document.getElementById(id);

function vaultEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── Section switching ──────────────────────────────────────────────── */
function showSection(section) {
  const isBooks = section === 'books';
  const booksSec = vaultEl('vault-books-section');
  const videosSec = vaultEl('vault-videos-section');
  const tabBooks = vaultEl('tab-books');
  const tabVideos = vaultEl('tab-videos');

  if (booksSec) booksSec.hidden = !isBooks;
  if (videosSec) videosSec.hidden = isBooks;

  if (tabBooks) tabBooks.classList.toggle('active', isBooks);
  if (tabVideos) tabVideos.classList.toggle('active', !isBooks);

  if (!isBooks && vaultItems.length === 0) {
    loadVault().catch(console.error);
  }

  EEEStudio.refreshIcons();
}

/* ── Book Shelf rendering ───────────────────────────────────────────── */
// Book files live in a private bucket. Every open or download asks for a
// fresh short-lived signed URL, and the storage policy rechecks the exact book
// grant each time, so a revoked or expired grant stops the file too.
const BOOK_BUCKET = 'solution-vault-books';
let booksState = 'loading';

function showVaultLinkNotice(message) {
  const notice = vaultEl('vault-link-notice');
  if (!notice) return;
  notice.textContent = message || '';
  notice.hidden = !message;
}

function renderBookShelf() {
  const grid = vaultEl('vault-books-grid');
  const empty = vaultEl('vault-books-empty');
  const countEl = vaultEl('vault-books-count');
  if (!grid) return;

  if (booksState === 'loading') {
    if (countEl) countEl.textContent = 'Loading';
    grid.innerHTML = '<p class="book-shelf-status">Opening your library...</p>';
    if (empty) empty.hidden = true;
    return;
  }

  if (booksState === 'error') {
    if (countEl) countEl.textContent = 'Not loaded';
    grid.innerHTML = '<div class="book-shelf-status"><p>Your library could not load just now. Your books and saved pages are safe.</p>' +
      '<button class="secondary-button" type="button" data-books-retry><i data-lucide="refresh-cw"></i><span>Try again</span></button></div>';
    if (empty) empty.hidden = true;
    EEEStudio.refreshIcons();
    return;
  }

  if (countEl) countEl.textContent = vaultBooks.length + ' title' + (vaultBooks.length === 1 ? '' : 's');

  if (!vaultBooks.length) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  grid.innerHTML = vaultBooks.map(book => {
    const isWeb = book.format === 'web';
    const badge = book.admin_preview ? 'Admin preview' : (isWeb ? 'Web book' : 'PDF book');
    let progressHtml = '';
    let actionLabel = 'Read book';
    if (book.progress_reset) {
      progressHtml = '<span class="book-progress-chip"><i data-lucide="refresh-cw"></i><span>Updated edition, starts from the beginning</span></span>';
    } else if (book.progress && !isWeb && book.progress.last_page) {
      progressHtml = '<span class="book-progress-chip"><i data-lucide="bookmark"></i><span>Page ' + vaultEscape(book.progress.last_page) + (book.page_count ? ' of ' + vaultEscape(book.page_count) : '') + '</span></span>';
      actionLabel = 'Continue reading';
    } else if (book.progress && isWeb && book.progress.last_chapter_id) {
      const chapters = Array.isArray(book.chapters) ? book.chapters : [];
      const chapter = chapters.find(c => c.id === book.progress.last_chapter_id);
      progressHtml = '<span class="book-progress-chip"><i data-lucide="bookmark"></i><span>' + vaultEscape(chapter ? chapter.title : 'Chapter saved') + '</span></span>';
      actionLabel = 'Continue reading';
    }

    const downloadBtn = book.download_enabled
      ? '<button class="secondary-button" type="button" data-download-slug="' + vaultEscape(book.slug) + '"><i data-lucide="download"></i><span>Download</span></button>'
      : '';

    return '<article class="book-card" data-book-slug="' + vaultEscape(book.slug) + '">' +
      '<div class="book-card-cover">' +
        '<img src="' + vaultEscape(book.cover_url || '/assets/eee/vault.png') + '" alt="Cover of ' + vaultEscape(book.title) + '">' +
        '<span class="book-format-badge">' + badge + '</span>' +
      '</div>' +
      '<div class="book-card-body">' +
        '<h2>' + vaultEscape(book.title) + '</h2>' +
        '<p class="book-card-subtitle">' + vaultEscape(book.subtitle || '') + '</p>' +
        '<p class="book-card-desc">' + vaultEscape(book.description || '') + '</p>' +
        progressHtml +
        '<div class="book-card-actions">' +
          '<button class="primary-button" type="button" data-read-slug="' + vaultEscape(book.slug) + '">' +
            '<i data-lucide="book-open"></i><span>' + actionLabel + '</span>' +
          '</button>' +
          downloadBtn +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');

  EEEStudio.refreshIcons();
}

async function loadBooks() {
  booksState = 'loading';
  renderBookShelf();
  try {
    const { data, error } = await vaultContext.sb.rpc('my_solution_vault_books');
    if (error || !Array.isArray(data)) throw error || new Error('Unexpected library response');
    vaultBooks = data;
    booksState = 'ready';
  } catch (err) {
    vaultBooks = [];
    booksState = 'error';
  }
  renderBookShelf();
  return booksState === 'ready';
}

async function signedBookUrl(book, download) {
  if (!book || !book.content_path) throw new Error('This book has no file yet.');
  const options = download ? { download: book.download_filename || true } : undefined;
  const { data, error } = await vaultContext.sb.storage.from(BOOK_BUCKET).createSignedUrl(book.content_path, 120, options);
  if (error || !data || !data.signedUrl) throw error || new Error('No file link');
  return data.signedUrl;
}

async function downloadBook(book, onError) {
  try {
    window.location.assign(await signedBookUrl(book, true));
  } catch (err) {
    onError('The download is not available right now. Reading here in Studio still works.');
  }
}

/* ── PDF Reader ─────────────────────────────────────────────────────── */
// One path changes the page (goToPdfPage), so buttons, the page box and the
// arrow keys all clamp and save the same way. Opening a book never writes;
// only a page change does, debounced, and the pending save is flushed when the
// reader closes or the tab is hidden, so the last page is not lost.
let pdfLoadToken = 0;
let pdfRenderTask = null;
let pdfSavePending = null;
let pdfLastSaved = null;

function openPdfReader(book) {
  activeBook = book;
  const reader = vaultEl('vault-pdf-reader');
  const booksSec = vaultEl('vault-books-section');
  const videosSec = vaultEl('vault-videos-section');
  const tabs = vaultEl('vault-tabs');
  if (booksSec) booksSec.hidden = true;
  if (videosSec) videosSec.hidden = true;
  if (tabs) tabs.hidden = true;
  if (reader) reader.hidden = false;
  showVaultLinkNotice('');

  vaultEl('pdf-reader-title').textContent = book.title;
  vaultEl('pdf-reader-subtitle').textContent = book.subtitle || '';
  const downloadBtn = vaultEl('pdf-download-btn');
  if (downloadBtn) downloadBtn.hidden = !book.download_enabled;

  const saved = book.progress && Number(book.progress.last_page);
  currentPdfPage = Number.isFinite(saved) && saved >= 1 ? saved : 1;
  pdfLastSaved = { slug: book.slug, page: currentPdfPage };

  const canvas = vaultEl('pdf-canvas');
  if (canvas) { canvas.width = 0; canvas.height = 0; }
  vaultEl('pdf-page-count').textContent = book.page_count || '-';
  vaultEl('pdf-page-num').value = currentPdfPage;
  showPdfNotice(book.progress_reset ? 'This book was updated since you last read it, so it opens at the start.' : 'Opening your book...');

  loadPdfDocument(book);
  EEEStudio.refreshIcons();
  window.scrollTo(0, 0);
}

function closePdfReader() {
  flushPdfSave();
  pdfLoadToken++;
  if (pdfRenderTask) { try { pdfRenderTask.cancel(); } catch (e) {} pdfRenderTask = null; }
  if (pdfDoc) { try { pdfDoc.destroy(); } catch (e) {} }
  pdfDoc = null;
  pdfRendering = false;
  pdfPendingPage = null;

  const reader = vaultEl('vault-pdf-reader');
  if (reader) reader.hidden = true;
  const tabs = vaultEl('vault-tabs');
  if (tabs && !tabs.dataset.forcedHidden) tabs.hidden = false;
  const booksSec = vaultEl('vault-books-section');
  if (booksSec) booksSec.hidden = false;
  showPdfNotice('');

  activeBook = null;
  loadBooks().catch(console.error);
}

async function loadPdfDocument(book) {
  const token = ++pdfLoadToken;
  const canvasWrap = vaultEl('pdf-canvas-wrap');
  if (canvasWrap) canvasWrap.scrollTop = 0;

  if (!window.pdfjsLib) {
    showPdfNotice('The book viewer could not load. Refresh the page to try again.');
    return;
  }

  let url;
  try {
    url = await signedBookUrl(book, false);
  } catch (err) {
    if (token === pdfLoadToken) showPdfNotice('This book file is not available right now. Your access and saved page are safe; please try again later.');
    return;
  }

  try {
    const doc = await window.pdfjsLib.getDocument({ url }).promise;
    if (token !== pdfLoadToken) { doc.destroy(); return; }
    pdfDoc = doc;
    vaultEl('pdf-page-count').textContent = pdfDoc.numPages;
    vaultEl('pdf-page-num').max = pdfDoc.numPages;
    currentPdfPage = Math.max(1, Math.min(pdfDoc.numPages, currentPdfPage));
    showPdfNotice(book.progress_reset ? 'This book was updated since you last read it, so it opens at the start.' : '');
    fitPdfWidth();
  } catch (err) {
    if (token === pdfLoadToken) showPdfNotice('This book could not be opened. Check your connection and try again.');
  }
}

function fitPdfWidth() {
  if (!pdfDoc) return;
  const wrap = vaultEl('pdf-canvas-wrap');
  const availableWidth = wrap ? Math.max(240, wrap.clientWidth - 32) : 800;
  pdfDoc.getPage(currentPdfPage).then(page => {
    const viewport = page.getViewport({ scale: 1.0 });
    pdfScale = Math.max(0.4, Math.min(2.5, availableWidth / viewport.width));
    queueRenderPage(currentPdfPage);
  }).catch(() => queueRenderPage(currentPdfPage));
}

function renderPdfPage(num) {
  if (!pdfDoc) return;
  pdfRendering = true;
  const token = pdfLoadToken;
  vaultEl('pdf-page-num').value = num;

  pdfDoc.getPage(num).then(page => {
    if (token !== pdfLoadToken) return;
    const canvas = vaultEl('pdf-canvas');
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: pdfScale });
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    vaultEl('pdf-page').style.width = Math.floor(viewport.width) + 'px';
    const linkLayer = vaultEl('pdf-link-layer');
    if (linkLayer) linkLayer.textContent = '';
    pdfRenderTask = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
    });
    return pdfRenderTask.promise.then(() => renderPdfLinks(page, viewport, token));
  }).catch(() => {}).then(() => {
    pdfRenderTask = null;
    pdfRendering = false;
    if (pdfPendingPage !== null) {
      const next = pdfPendingPage;
      pdfPendingPage = null;
      renderPdfPage(next);
    }
  });
}

// The page is drawn as an image, so its links are laid over it as real
// anchors, positioned in percentages so they scale with the page. Jumps
// inside the book go through goToPdfPage (and save the page like any other
// move); outside links open in a new tab so the reader keeps their place.
// Only http, https and mailto links are made clickable.
async function renderPdfLinks(page, viewport, token) {
  const layer = vaultEl('pdf-link-layer');
  if (!layer || !pdfDoc) return;
  let annotations = [];
  try { annotations = await page.getAnnotations(); } catch (e) { return; }
  if (token !== pdfLoadToken) return;
  layer.textContent = '';
  for (const annotation of annotations) {
    if (annotation.subtype !== 'Link' || !annotation.rect) continue;
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
    const link = document.createElement('a');
    link.className = 'pdf-link';
    link.style.left = (Math.min(x1, x2) / viewport.width * 100) + '%';
    link.style.top = (Math.min(y1, y2) / viewport.height * 100) + '%';
    link.style.width = (Math.abs(x2 - x1) / viewport.width * 100) + '%';
    link.style.height = (Math.abs(y2 - y1) / viewport.height * 100) + '%';

    if (annotation.url) {
      let url;
      try { url = new URL(annotation.url); } catch (e) { continue; }
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) continue;
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = url.protocol === 'mailto:' ? url.pathname : url.host;
      link.setAttribute('aria-label', 'Open ' + link.title + ' in a new tab');
    } else if (annotation.dest) {
      link.href = '#';
      link.setAttribute('aria-label', 'Go to another page in this book');
      link.addEventListener('click', event => {
        event.preventDefault();
        goToPdfDestination(annotation.dest);
      });
    } else {
      continue;
    }
    layer.appendChild(link);
  }
}

async function goToPdfDestination(dest) {
  if (!pdfDoc) return;
  try {
    const explicit = typeof dest === 'string' ? await pdfDoc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit.length) return;
    const target = explicit[0];
    const pageIndex = typeof target === 'number' ? target : await pdfDoc.getPageIndex(target);
    goToPdfPage(pageIndex + 1);
  } catch (e) {
    showPdfNotice('That link could not be followed. You can use the page box to jump instead.');
  }
}

function queueRenderPage(num) {
  if (pdfRendering) {
    pdfPendingPage = num;
  } else {
    renderPdfPage(num);
  }
}

function goToPdfPage(num) {
  if (!pdfDoc || !Number.isFinite(num)) return;
  const page = Math.max(1, Math.min(pdfDoc.numPages, Math.round(num)));
  vaultEl('pdf-page-num').value = page;
  if (page === currentPdfPage) return;
  currentPdfPage = page;
  queueRenderPage(page);
  queueSavePage(page);
  const wrap = vaultEl('pdf-canvas-wrap');
  if (wrap) wrap.scrollTop = 0;
}

function showPdfNotice(msg) {
  const n = vaultEl('pdf-notice');
  if (!n) return;
  n.textContent = msg || '';
  n.hidden = !msg;
}

function queueSavePage(page) {
  // An admin previewing a book they do not hold has no reading position to keep.
  if (!activeBook || activeBook.admin_preview) return;
  pdfSavePending = {
    slug: activeBook.slug,
    page,
    completed: pdfDoc && page >= pdfDoc.numPages ? true : null
  };
  clearTimeout(pdfSaveTimer);
  pdfSaveTimer = setTimeout(flushPdfSave, 1200);
}

async function flushPdfSave() {
  clearTimeout(pdfSaveTimer);
  pdfSaveTimer = null;
  const pending = pdfSavePending;
  pdfSavePending = null;
  if (!pending) return;
  if (pdfLastSaved && pdfLastSaved.slug === pending.slug && pdfLastSaved.page === pending.page) return;
  try {
    const { error } = await vaultContext.sb.rpc('save_solution_vault_progress', {
      target_book_slug: pending.slug,
      target_page: pending.page,
      target_completed: pending.completed
    });
    if (error) throw error;
    pdfLastSaved = { slug: pending.slug, page: pending.page };
    if (activeBook && activeBook.slug === pending.slug && pdfDoc) showPdfNotice('');
  } catch (e) {
    if (activeBook && activeBook.slug === pending.slug) showPdfNotice('Your page could not be saved just now. You can keep reading.');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPdfSave();
});
window.addEventListener('pagehide', () => { flushPdfSave(); });

/* ── Web Book Reader ────────────────────────────────────────────────── */
let webLastSavedChapter = null;

function openWebReader(book) {
  activeBook = book;
  const reader = vaultEl('vault-web-reader');
  const booksSec = vaultEl('vault-books-section');
  const videosSec = vaultEl('vault-videos-section');
  const tabs = vaultEl('vault-tabs');
  if (booksSec) booksSec.hidden = true;
  if (videosSec) videosSec.hidden = true;
  if (tabs) tabs.hidden = true;
  if (reader) reader.hidden = false;
  showVaultLinkNotice('');

  vaultEl('web-reader-title').textContent = book.title;
  vaultEl('web-reader-subtitle').textContent = book.progress_reset
    ? 'Updated edition: starting from the first chapter.'
    : (book.subtitle || 'Web book');

  const chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const select = vaultEl('web-chapter-select');
  select.innerHTML = chapters.map((ch, i) => '<option value="' + i + '">' + vaultEscape(ch.title || ('Chapter ' + (i + 1))) + '</option>').join('');

  let startIdx = 0;
  webLastSavedChapter = book.progress && book.progress.last_chapter_id ? book.progress.last_chapter_id : null;
  if (webLastSavedChapter) {
    const found = chapters.findIndex(c => c.id === webLastSavedChapter);
    if (found >= 0) startIdx = found;
  }

  showWebChapter(startIdx);
  EEEStudio.refreshIcons();
  window.scrollTo(0, 0);
}

function closeWebReader() {
  const reader = vaultEl('vault-web-reader');
  if (reader) reader.hidden = true;
  const tabs = vaultEl('vault-tabs');
  if (tabs && !tabs.dataset.forcedHidden) tabs.hidden = false;
  const booksSec = vaultEl('vault-books-section');
  if (booksSec) booksSec.hidden = false;
  activeBook = null;
  loadBooks().catch(console.error);
}

function showWebChapter(idx) {
  if (!activeBook || !Array.isArray(activeBook.chapters) || !activeBook.chapters.length) return;
  const chapters = activeBook.chapters;
  idx = Math.max(0, Math.min(chapters.length - 1, idx));
  currentWebChapterIdx = idx;
  const ch = chapters[idx];
  vaultEl('web-chapter-select').value = idx;
  vaultEl('web-chapter-heading').textContent = ch.title || ('Chapter ' + (idx + 1));

  // Plain text only: paragraphs are text nodes, so no markup in content runs.
  const bodyEl = vaultEl('web-body-text');
  bodyEl.textContent = '';
  for (const para of String(ch.content || '').split(/\n\s*\n/).filter(Boolean)) {
    const p = document.createElement('p');
    p.textContent = para.trim();
    bodyEl.appendChild(p);
  }

  vaultEl('web-prev-chapter').disabled = idx === 0;
  vaultEl('web-next-chapter').disabled = idx === chapters.length - 1;

  // Save only a real chapter change, never the act of opening.
  if (ch.id && ch.id !== webLastSavedChapter && !activeBook.admin_preview) {
    const slug = activeBook.slug;
    webLastSavedChapter = ch.id;
    vaultContext.sb.rpc('save_solution_vault_progress', {
      target_book_slug: slug,
      target_chapter_id: ch.id,
      target_completed: idx === chapters.length - 1 ? true : null
    }).then(({ error }) => {
      if (error && activeBook && activeBook.slug === slug) {
        vaultEl('web-reader-subtitle').textContent = 'Your chapter could not be saved just now. You can keep reading.';
      }
    });
  }
}

/* ── Video Room (existing implementation preserved) ─────────────────── */
function filteredVaultItems() {
  const query = vaultEl('vault-search').value.trim().toLowerCase();
  const topic = vaultEl('vault-topic').value;
  return vaultItems.filter(item => {
    if (topic && item.topic !== topic) return false;
    const text = [item.title, item.speaker, item.topic, item.description].filter(Boolean).join(' ').toLowerCase();
    return !query || text.includes(query);
  });
}

function renderVault() {
  const items = filteredVaultItems();
  vaultEl('vault-count').textContent = vaultItems.length + ' recording' + (vaultItems.length === 1 ? '' : 's');
  vaultEl('vault-empty').hidden = vaultItems.length > 0;
  vaultEl('vault-grid').hidden = vaultItems.length === 0;
  vaultEl('vault-grid').innerHTML = items.map(item => {
    const complete = vaultProgress.get(item.id) === true;
    const image = item.thumbnail_url || '/assets/eee/vault.png';
    return '<article class="vault-card"><div class="vault-card-media"><img src="' + vaultEscape(image) + '" alt=""><span>' + vaultEscape(item.topic || 'Speaker session') + '</span></div><div class="vault-card-copy"><h2>' + vaultEscape(item.title) + '</h2><p class="vault-speaker">' + vaultEscape(item.speaker || 'Colorado Mastermind') + '</p><p class="vault-description">' + vaultEscape(item.description || '') + '</p><div class="vault-card-actions"><a class="secondary-button" href="' + vaultEscape(item.video_url) + '" target="_blank" rel="noopener"><i data-lucide="play"></i><span>Watch</span></a><button class="secondary-button vault-complete' + (complete ? ' completed' : '') + '" type="button" data-complete-id="' + vaultEscape(item.id) + '"><i data-lucide="' + (complete ? 'check' : 'circle') + '"></i><span>' + (complete ? 'Completed' : 'Mark complete') + '</span></button></div></div></article>';
  }).join('');
  EEEStudio.refreshIcons();
}

function renderTopics() {
  const topics = [...new Set(vaultItems.map(item => item.topic).filter(Boolean))].sort();
  vaultEl('vault-topic').innerHTML = '<option value="">All topics</option>' + topics.map(topic => '<option value="' + vaultEscape(topic) + '">' + vaultEscape(topic) + '</option>').join('');
}

async function loadVault() {
  const [itemsResult, progressResult] = await Promise.all([
    vaultContext.sb.from('solution_vault_items').select('*').eq('published', true).order('sort_order').order('created_at', { ascending: false }),
    vaultContext.sb.from('solution_vault_progress').select('item_id,completed').eq('user_id', vaultContext.profile.id)
  ]);
  if (itemsResult.error) throw itemsResult.error;
  vaultItems = itemsResult.data || [];
  vaultProgress = new Map((progressResult.data || []).map(row => [row.item_id, row.completed]));
  renderTopics();
  renderVault();
}

async function toggleVaultComplete(itemId) {
  const completed = !(vaultProgress.get(itemId) === true);
  const { error } = await vaultContext.sb.from('solution_vault_progress').upsert({ user_id: vaultContext.profile.id, item_id: itemId, completed, watched_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,item_id' });
  if (error) return;
  vaultProgress.set(itemId, completed);
  renderVault();
}

async function addVaultItem(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const item = {
    title: vaultEl('vault-title').value.trim(),
    speaker: vaultEl('vault-speaker').value.trim() || null,
    topic: vaultEl('vault-item-topic').value.trim() || null,
    description: vaultEl('vault-description').value.trim() || null,
    video_url: vaultEl('vault-url').value.trim(),
    thumbnail_url: vaultEl('vault-thumbnail').value.trim() || null,
    published: true
  };
  const { error } = await vaultContext.sb.from('solution_vault_items').insert(item);
  if (error) {
    vaultEl('vault-admin-message').textContent = error.message;
    vaultEl('vault-admin-message').className = 'eee-message error';
  } else {
    vaultEl('vault-admin-form').reset();
    vaultEl('vault-admin-message').textContent = 'Recording added.';
    vaultEl('vault-admin-message').className = 'eee-message success';
    await loadVault();
  }
  button.disabled = false;
}

/* ── Event wiring ───────────────────────────────────────────────────── */
function wireEvents() {
  // Tab clicks
  const tabBooks = vaultEl('tab-books');
  const tabVideos = vaultEl('tab-videos');
  if (tabBooks) tabBooks.addEventListener('click', () => showSection('books'));
  if (tabVideos) tabVideos.addEventListener('click', () => showSection('videos'));

  // Books shelf click to read
  const booksGrid = vaultEl('vault-books-grid');
  if (booksGrid) {
    booksGrid.addEventListener('click', event => {
      if (event.target.closest('[data-books-retry]')) { loadBooks().catch(console.error); return; }
      const downloadBtn = event.target.closest('[data-download-slug]');
      if (downloadBtn) {
        const target = vaultBooks.find(b => b.slug === downloadBtn.dataset.downloadSlug);
        if (target) downloadBook(target, showVaultLinkNotice);
        return;
      }
      const readBtn = event.target.closest('[data-read-slug]');
      if (!readBtn) return;
      const slug = readBtn.dataset.readSlug;
      const book = vaultBooks.find(b => b.slug === slug);
      if (!book) return;
      if (book.format === 'web') {
        openWebReader(book);
      } else {
        openPdfReader(book);
      }
    });
  }

  // PDF reader controls
  const pdfBack = vaultEl('pdf-back-btn');
  if (pdfBack) pdfBack.addEventListener('click', closePdfReader);

  const pdfPrev = vaultEl('pdf-prev');
  if (pdfPrev) pdfPrev.addEventListener('click', () => goToPdfPage(currentPdfPage - 1));

  const pdfNext = vaultEl('pdf-next');
  if (pdfNext) pdfNext.addEventListener('click', () => goToPdfPage(currentPdfPage + 1));

  const pdfPageInput = vaultEl('pdf-page-num');
  if (pdfPageInput) {
    pdfPageInput.addEventListener('change', () => goToPdfPage(Number(pdfPageInput.value)));
  }

  const pdfZoomIn = vaultEl('pdf-zoom-in');
  if (pdfZoomIn) pdfZoomIn.addEventListener('click', () => {
    pdfScale = Math.min(3.0, pdfScale + 0.25);
    queueRenderPage(currentPdfPage);
  });

  const pdfZoomOut = vaultEl('pdf-zoom-out');
  if (pdfZoomOut) pdfZoomOut.addEventListener('click', () => {
    pdfScale = Math.max(0.4, pdfScale - 0.25);
    queueRenderPage(currentPdfPage);
  });

  const pdfDownload = vaultEl('pdf-download-btn');
  if (pdfDownload) pdfDownload.addEventListener('click', event => {
    event.preventDefault();
    if (activeBook) downloadBook(activeBook, showPdfNotice);
  });

  const pdfFit = vaultEl('pdf-fit-width');
  if (pdfFit) pdfFit.addEventListener('click', fitPdfWidth);

  // Web reader controls
  const webBack = vaultEl('web-back-btn');
  if (webBack) webBack.addEventListener('click', closeWebReader);

  const chapterSelect = vaultEl('web-chapter-select');
  if (chapterSelect) {
    chapterSelect.addEventListener('change', () => {
      showWebChapter(Number(chapterSelect.value));
    });
  }

  const webPrev = vaultEl('web-prev-chapter');
  if (webPrev) webPrev.addEventListener('click', () => {
    showWebChapter(currentWebChapterIdx - 1);
  });

  const webNext = vaultEl('web-next-chapter');
  if (webNext) webNext.addEventListener('click', () => {
    showWebChapter(currentWebChapterIdx + 1);
  });

  const fontSmaller = vaultEl('web-font-smaller');
  if (fontSmaller) {
    fontSmaller.addEventListener('click', () => {
      const bodyEl = vaultEl('web-body-text');
      const cur = parseFloat(window.getComputedStyle(bodyEl).fontSize) || 17;
      bodyEl.style.fontSize = Math.max(13, cur - 2) + 'px';
    });
  }

  const fontLarger = vaultEl('web-font-larger');
  if (fontLarger) {
    fontLarger.addEventListener('click', () => {
      const bodyEl = vaultEl('web-body-text');
      const cur = parseFloat(window.getComputedStyle(bodyEl).fontSize) || 17;
      bodyEl.style.fontSize = Math.min(26, cur + 2) + 'px';
    });
  }

  // Keyboard navigation for readers (Arrow keys and Escape)
  document.addEventListener('keydown', event => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    const pdfReader = vaultEl('vault-pdf-reader');
    if (pdfReader && !pdfReader.hidden) {
      if (event.key === 'ArrowLeft') {
        goToPdfPage(currentPdfPage - 1);
      } else if (event.key === 'ArrowRight') {
        goToPdfPage(currentPdfPage + 1);
      } else if (event.key === 'Escape') {
        closePdfReader();
      }
      return;
    }
    const webReader = vaultEl('vault-web-reader');
    if (webReader && !webReader.hidden) {
      if (event.key === 'ArrowLeft') {
        showWebChapter(currentWebChapterIdx - 1);
      } else if (event.key === 'ArrowRight') {
        showWebChapter(currentWebChapterIdx + 1);
      } else if (event.key === 'Escape') {
        closeWebReader();
      }
    }
  });

  // Video Room events
  const searchEl = vaultEl('vault-search');
  if (searchEl) searchEl.addEventListener('input', renderVault);

  const topicEl = vaultEl('vault-topic');
  if (topicEl) topicEl.addEventListener('change', renderVault);

  const gridEl = vaultEl('vault-grid');
  if (gridEl) {
    gridEl.addEventListener('click', event => {
      const button = event.target.closest('[data-complete-id]');
      if (button) toggleVaultComplete(button.dataset.completeId);
    });
  }

  const toggleEl = vaultEl('vault-admin-toggle');
  if (toggleEl) {
    toggleEl.addEventListener('click', () => {
      vaultEl('vault-admin-form').hidden = !vaultEl('vault-admin-form').hidden;
    });
  }

  const adminForm = vaultEl('vault-admin-form');
  if (adminForm) adminForm.addEventListener('submit', addVaultItem);
}

/* ── Studio Initialize Entry ────────────────────────────────────────── */
EEEStudio.initialize(async context => {
  vaultContext = context;
  wireEvents();

  // Admin access
  const isAdmin = context.profile && context.profile.is_admin === true;
  vaultEl('vault-admin').hidden = !isAdmin;

  // Determine user's library capabilities
  let hasVideos = false;
  try {
    const { data } = await vaultContext.sb.rpc('has_studio_app_access', { target_app_key: 'vault' });
    hasVideos = data === true;
  } catch (e) {}

  const booksLoaded = await loadBooks();
  // A failed library load still shows the shelf, with its retry, rather than
  // hiding books the person may own.
  const hasBooks = !booksLoaded || vaultBooks.length > 0;

  const tabs = vaultEl('vault-tabs');
  const booksSec = vaultEl('vault-books-section');
  const videosSec = vaultEl('vault-videos-section');
  const params = new URLSearchParams(window.location.search);
  const targetSlug = (params.get('book') || '').toLowerCase();

  if (hasVideos && hasBooks) {
    tabs.hidden = false;
    delete tabs.dataset.forcedHidden;
    if (window.location.hash === '#videos' || params.get('section') === 'video') {
      showSection('videos');
    } else {
      showSection('books');
    }
  } else if (hasBooks) {
    tabs.hidden = true;
    tabs.dataset.forcedHidden = 'true';
    showSection('books');
  } else if (hasVideos) {
    tabs.hidden = true;
    tabs.dataset.forcedHidden = 'true';
    showSection('videos');
  } else {
    tabs.hidden = true;
    if (booksSec) booksSec.hidden = true;
    if (videosSec) videosSec.hidden = true;
    EEEStudio.showGate('access');
    return;
  }

  // A direct book link opens that book. If this account does not hold it,
  // say so plainly instead of showing anything else in its place.
  if (targetSlug && booksLoaded) {
    const targetBook = vaultBooks.find(b => b.slug === targetSlug);
    if (targetBook) {
      if (targetBook.format === 'web') openWebReader(targetBook);
      else openPdfReader(targetBook);
    } else {
      showVaultLinkNotice('That book is not in the library for ' + (context.profile && context.profile.email ? context.profile.email : 'this account') +
        '. If it was sent to a different email address, sign out and sign in with that one.');
    }
  }
});
