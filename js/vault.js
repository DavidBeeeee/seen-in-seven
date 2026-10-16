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
function renderBookShelf() {
  const grid = vaultEl('vault-books-grid');
  const empty = vaultEl('vault-books-empty');
  const countEl = vaultEl('vault-books-count');

  if (countEl) {
    countEl.textContent = vaultBooks.length + ' title' + (vaultBooks.length === 1 ? '' : 's');
  }

  if (!vaultBooks || vaultBooks.length === 0) {
    if (grid) grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  if (!grid) return;

  grid.innerHTML = vaultBooks.map(book => {
    const cover = book.cover_url || '/assets/vault/the-5e-framework-cover.png';
    const isWeb = book.format === 'web';
    const badge = isWeb ? 'Web Book' : 'PDF Book';

    let progressHtml = '';
    let actionLabel = 'Read book';
    if (book.progress) {
      if (!isWeb && book.progress.last_page) {
        progressHtml = '<span class="book-progress-chip"><i data-lucide="bookmark"></i><span>Page ' + vaultEscape(book.progress.last_page) + '</span></span>';
        actionLabel = 'Continue reading (Page ' + vaultEscape(book.progress.last_page) + ')';
      } else if (isWeb && book.progress.last_chapter_id) {
        progressHtml = '<span class="book-progress-chip"><i data-lucide="bookmark"></i><span>Chapter saved</span></span>';
        actionLabel = 'Continue reading';
      }
    }

    const downloadBtn = (book.download_enabled && book.download_path)
      ? '<a class="secondary-button" href="' + vaultEscape(book.download_path) + '" download><i data-lucide="download"></i><span>Download</span></a>'
      : '';

    return '<article class="book-card" data-book-slug="' + vaultEscape(book.slug) + '">' +
      '<div class="book-card-cover">' +
        '<img src="' + vaultEscape(cover) + '" alt="' + vaultEscape(book.title) + '">' +
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
  try {
    const { data, error } = await vaultContext.sb.rpc('my_solution_vault_books');
    if (!error && Array.isArray(data)) {
      vaultBooks = data;
    } else {
      // Direct query fallback
      const direct = await vaultContext.sb.from('solution_vault_books').select('*').eq('published', true);
      vaultBooks = direct.data || [];
    }
  } catch (err) {
    vaultBooks = [];
  }
  renderBookShelf();
}

/* ── PDF Reader ─────────────────────────────────────────────────────── */
function openPdfReader(book) {
  activeBook = book;
  const reader = vaultEl('vault-pdf-reader');
  const booksSec = vaultEl('vault-books-section');
  const tabs = vaultEl('vault-tabs');

  if (booksSec) booksSec.hidden = true;
  if (tabs) tabs.hidden = true;
  if (reader) reader.hidden = false;

  vaultEl('pdf-reader-title').textContent = book.title;
  vaultEl('pdf-reader-subtitle').textContent = book.subtitle || '';

  const downloadBtn = vaultEl('pdf-download-btn');
  if (downloadBtn) {
    downloadBtn.hidden = !book.download_enabled;
    downloadBtn.href = book.download_path || ('/api/vault-book?slug=' + encodeURIComponent(book.slug) + '&download=1');
  }

  const savedPage = (book.progress && book.progress.last_page) ? Number(book.progress.last_page) : 1;
  currentPdfPage = Number.isFinite(savedPage) && savedPage >= 1 ? savedPage : 1;

  loadPdfDocument(book.slug);
  EEEStudio.refreshIcons();
}

function closePdfReader() {
  const reader = vaultEl('vault-pdf-reader');
  if (reader) reader.hidden = true;

  const tabs = vaultEl('vault-tabs');
  if (tabs && !tabs.dataset.forcedHidden) tabs.hidden = false;

  const booksSec = vaultEl('vault-books-section');
  if (booksSec) booksSec.hidden = false;

  pdfDoc = null;
  activeBook = null;
  loadBooks().catch(console.error);
}

async function loadPdfDocument(slug) {
  const canvasWrap = vaultEl('pdf-canvas-wrap');
  if (canvasWrap) canvasWrap.scrollTop = 0;

  try {
    if (!window.pdfjsLib) {
      throw new Error('PDF viewing library could not be loaded.');
    }

    const { data } = await vaultContext.sb.auth.getSession();
    const token = data && data.session ? data.session.access_token : '';

    const loadingTask = window.pdfjsLib.getDocument({
      url: '/api/vault-book?slug=' + encodeURIComponent(slug) + '&content=1',
      httpHeaders: { Authorization: 'Bearer ' + token }
    });

    pdfDoc = await loadingTask.promise;
    vaultEl('pdf-page-count').textContent = pdfDoc.numPages;
    vaultEl('pdf-page-num').max = pdfDoc.numPages;

    if (currentPdfPage > pdfDoc.numPages) currentPdfPage = pdfDoc.numPages;

    fitPdfWidth();
  } catch (err) {
    showPdfNotice('Could not load PDF document. Please try again.');
  }
}

function fitPdfWidth() {
  if (!pdfDoc) return;
  const wrap = vaultEl('pdf-canvas-wrap');
  const availableWidth = wrap ? wrap.clientWidth - 48 : 800;

  pdfDoc.getPage(currentPdfPage).then(page => {
    const defaultViewport = page.getViewport({ scale: 1.0 });
    pdfScale = Math.max(0.5, Math.min(2.5, availableWidth / defaultViewport.width));
    renderPdfPage(currentPdfPage);
  }).catch(() => {
    renderPdfPage(currentPdfPage);
  });
}

function renderPdfPage(num) {
  if (!pdfDoc) return;
  pdfRendering = true;

  pdfDoc.getPage(num).then(page => {
    const canvas = vaultEl('pdf-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const viewport = page.getViewport({ scale: pdfScale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = { canvasContext: ctx, viewport };
    const renderTask = page.render(renderContext);

    renderTask.promise.then(() => {
      pdfRendering = false;
      if (pdfPendingPage !== null) {
        const next = pdfPendingPage;
        pdfPendingPage = null;
        renderPdfPage(next);
      }
    });
  });

  vaultEl('pdf-page-num').value = num;
  queueSavePage(num);
}

function queueRenderPage(num) {
  if (pdfRendering) {
    pdfPendingPage = num;
  } else {
    renderPdfPage(num);
  }
}

function showPdfNotice(msg) {
  const n = vaultEl('pdf-notice');
  if (!n) return;
  n.textContent = msg;
  n.hidden = !msg;
}

function queueSavePage(page) {
  if (!activeBook) return;
  clearTimeout(pdfSaveTimer);
  pdfSaveTimer = setTimeout(async () => {
    try {
      const { error } = await vaultContext.sb.rpc('save_solution_vault_progress', {
        target_book_slug: activeBook.slug,
        target_page: page,
        target_completed: pdfDoc ? page >= pdfDoc.numPages : false
      });
      if (error) {
        showPdfNotice('Reading progress could not be saved to your account right now.');
      } else {
        showPdfNotice('');
      }
    } catch (e) {
      showPdfNotice('Reading progress could not be saved to your account right now.');
    }
  }, 750);
}

/* ── Web Book Reader ────────────────────────────────────────────────── */
function openWebReader(book) {
  activeBook = book;
  const reader = vaultEl('vault-web-reader');
  const booksSec = vaultEl('vault-books-section');
  const tabs = vaultEl('vault-tabs');

  if (booksSec) booksSec.hidden = true;
  if (tabs) tabs.hidden = true;
  if (reader) reader.hidden = false;

  vaultEl('web-reader-title').textContent = book.title;
  vaultEl('web-reader-subtitle').textContent = book.subtitle || 'Web Book';

  const chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const select = vaultEl('web-chapter-select');
  select.innerHTML = chapters.map((ch, i) => {
    return '<option value="' + i + '">' + vaultEscape(ch.title || ('Chapter ' + (i + 1))) + '</option>';
  }).join('');

  let startIdx = 0;
  if (book.progress && book.progress.last_chapter_id) {
    const found = chapters.findIndex(c => c.id === book.progress.last_chapter_id);
    if (found >= 0) startIdx = found;
  }

  showWebChapter(startIdx);
  EEEStudio.refreshIcons();
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
  if (!activeBook || !Array.isArray(activeBook.chapters)) return;
  const chapters = activeBook.chapters;
  if (idx < 0) idx = 0;
  if (idx >= chapters.length) idx = chapters.length - 1;

  currentWebChapterIdx = idx;
  const ch = chapters[idx];
  vaultEl('web-chapter-select').value = idx;
  vaultEl('web-chapter-heading').textContent = ch.title || ('Chapter ' + (idx + 1));

  // Safe DOM construction: sanitize paragraph text
  const bodyEl = vaultEl('web-body-text');
  bodyEl.innerHTML = '';
  const paras = String(ch.content || '').split(/\n\s*\n/).filter(Boolean);
  for (const para of paras) {
    const p = document.createElement('p');
    p.textContent = para.trim();
    bodyEl.appendChild(p);
  }

  vaultEl('web-prev-chapter').disabled = idx === 0;
  vaultEl('web-next-chapter').disabled = idx === chapters.length - 1;

  // Save progress
  if (vaultContext && vaultContext.sb) {
    vaultContext.sb.rpc('save_solution_vault_progress', {
      target_book_slug: activeBook.slug,
      target_chapter_id: ch.id,
      target_completed: idx === chapters.length - 1
    }).catch(console.error);
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
  if (pdfPrev) pdfPrev.addEventListener('click', () => {
    if (currentPdfPage <= 1) return;
    currentPdfPage--;
    queueRenderPage(currentPdfPage);
  });

  const pdfNext = vaultEl('pdf-next');
  if (pdfNext) pdfNext.addEventListener('click', () => {
    if (!pdfDoc || currentPdfPage >= pdfDoc.numPages) return;
    currentPdfPage++;
    queueRenderPage(currentPdfPage);
  });

  const pdfPageInput = vaultEl('pdf-page-num');
  if (pdfPageInput) {
    pdfPageInput.addEventListener('change', () => {
      const val = Number(pdfPageInput.value);
      if (!pdfDoc || !Number.isFinite(val)) return;
      currentPdfPage = Math.max(1, Math.min(pdfDoc.numPages, val));
      queueRenderPage(currentPdfPage);
    });
  }

  const pdfZoomIn = vaultEl('pdf-zoom-in');
  if (pdfZoomIn) pdfZoomIn.addEventListener('click', () => {
    pdfScale = Math.min(3.0, pdfScale + 0.25);
    renderPdfPage(currentPdfPage);
  });

  const pdfZoomOut = vaultEl('pdf-zoom-out');
  if (pdfZoomOut) pdfZoomOut.addEventListener('click', () => {
    pdfScale = Math.max(0.5, pdfScale - 0.25);
    renderPdfPage(currentPdfPage);
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
        renderPdfPage(currentPdfPage - 1);
      } else if (event.key === 'ArrowRight') {
        renderPdfPage(currentPdfPage + 1);
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

  await loadBooks();
  const hasBooks = vaultBooks.length > 0;

  const tabs = vaultEl('vault-tabs');
  const booksSec = vaultEl('vault-books-section');
  const videosSec = vaultEl('vault-videos-section');

  // Case 1: Both access types
  if (hasVideos && hasBooks) {
    tabs.hidden = false;
    delete tabs.dataset.forcedHidden;
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    if (hash === '#videos' || urlParams.get('section') === 'video') {
      showSection('videos');
    } else {
      showSection('books');
    }
  }
  // Case 2: Book-only access
  else if (hasBooks) {
    tabs.hidden = true;
    tabs.dataset.forcedHidden = 'true';
    showSection('books');
  }
  // Case 3: Video-only access
  else if (hasVideos) {
    tabs.hidden = true;
    tabs.dataset.forcedHidden = 'true';
    showSection('videos');
  }
  // Case 4: Neither access type
  else {
    tabs.hidden = true;
    if (booksSec) booksSec.hidden = true;
    if (videosSec) videosSec.hidden = true;
    EEEStudio.showGate('access');
    return;
  }

  // Check for direct book link in URL
  const targetSlug = new URLSearchParams(window.location.search).get('book');
  if (targetSlug) {
    const targetBook = vaultBooks.find(b => b.slug === targetSlug.toLowerCase());
    if (targetBook) {
      if (targetBook.format === 'web') {
        openWebReader(targetBook);
      } else {
        openPdfReader(targetBook);
      }
    }
  }
});
