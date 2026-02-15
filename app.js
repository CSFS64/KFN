(function () {
  'use strict';

  const root = document.getElementById('appRoot');
  const pane = document.getElementById('scrollPane');
  const doc  = document.getElementById('doc');

  const q        = document.getElementById('q');
  const meta     = document.getElementById('searchMeta');
  const btnFind  = document.getElementById('btnFind');
  const btnPrev  = document.getElementById('btnPrev');
  const btnNext  = document.getElementById('btnNext');
  const btnClear = document.getElementById('btnClear');

  const btnHome  = document.getElementById('btnHome');
  const btnPdf   = document.getElementById('btnPdf');
  const langEN   = document.getElementById('langEN');
  const langZH   = document.getElementById('langZH');

  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomIn  = document.getElementById('btnZoomIn');
  const zoomLabel  = document.getElementById('zoomLabel');

  const viewHome    = document.getElementById('viewHome');
  const viewArticle = document.getElementById('viewArticle');
  const viewAbout   = document.getElementById('viewAbout');

  const articleListEl = document.getElementById('articleList');

  // 文章区容器（你原本是两个 div：#articleEN / #articleZH）
  const enEl = document.getElementById('articleEN');
  const zhEl = document.getElementById('articleZH');

  const topBrand = document.getElementById('topBrand');
  const topHint  = document.getElementById('topHint');

  const STATE = {
    lang: 'en',
    zoom: 1,
    hits: [],
    activeIdx: -1,
    articles: [],
    site: null,
    current: null
  };

  function safeGet(key){ try { return localStorage.getItem(key); } catch(e){ return null; } }
  function safeSet(key,val){ try { localStorage.setItem(key,val); } catch(e){} }
  function setText(el,s){ if(el) el.textContent = s; }
  function normalizeQuery(s){ return (s||'').trim(); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function clampMod(i,n){ if(n<=0) return -1; return ((i % n) + n) % n; }

  function t2(obj, lang, fallback){
    if(obj == null) return fallback || '';
    if(typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.zh || fallback || '';
  }

  function renderTopbar(){
    if(!topBrand || !topHint) return;

    if(STATE.current){
      // 顶栏仍显示当前文章标题/简介（这是顶栏，不是“正文标题”）
      setText(topBrand, t2(STATE.current.title_i18n || STATE.current.title, STATE.lang, STATE.lang === 'zh' ? '未命名' : 'Untitled'));
      setText(topHint,  t2(STATE.current.desc_i18n  || STATE.current.desc,  STATE.lang, ''));
      return;
    }

    const site = STATE.site || {};
    setText(topBrand, t2(site.title, STATE.lang, 'Kalyna Field Notes'));
    setText(topHint,  t2(site.desc,  STATE.lang, ''));
  }

  function updateMeta(found, idx){
    if(!meta) return;
    // PDF iframe 内无法用你原来的 mark 高亮搜索，所以这里主要用作提示
    if(found === 0){
      setText(meta, STATE.lang === 'zh'
        ? 'PDF 请用 Ctrl+F 搜索'
        : 'Use Ctrl+F to search in PDF');
    }else{
      setText(meta, `${idx+1} / ${found} ${STATE.lang === 'zh' ? '处匹配' : 'matches'}`);
    }
  }

  // ====== 旧的 HTML 高亮搜索：对 PDF iframe 不可用，保留按钮但改成提示 ======
  function clearHighlights(){
    STATE.hits = [];
    STATE.activeIdx = -1;
  }
  function setActive(i){
    STATE.activeIdx = -1;
    updateMeta(0,0);
  }
  function highlightAll(query){
    // PDF iframe 无法注入 mark，高亮搜索改为提示
    const q2 = normalizeQuery(query);
    if(!q2){ updateMeta(0,0); return; }
    updateMeta(0,0);
  }

  function bindSearch(){
    if(btnFind) btnFind.addEventListener('click', () => highlightAll(q && q.value));
    if(q){
      q.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
          e.preventDefault();
          highlightAll(q.value);
        }
      });
    }
    if(btnPrev) btnPrev.addEventListener('click', () => setActive(STATE.activeIdx - 1));
    if(btnNext) btnNext.addEventListener('click', () => setActive(STATE.activeIdx + 1));
    if(btnClear) btnClear.addEventListener('click', () => {
      if(q) q.value = '';
      clearHighlights();
      updateMeta(0,0);
    });
  }

  function syncLangRadios(){
    if(langEN) langEN.checked = (STATE.lang === 'en');
    if(langZH) langZH.checked = (STATE.lang === 'zh');
  }

  function applyLang(lang){
    STATE.lang = (lang === 'zh') ? 'zh' : 'en';
    root.classList.toggle('lang-zh', STATE.lang === 'zh');
    root.classList.toggle('lang-en', STATE.lang === 'en');
    if(q) q.placeholder = (STATE.lang === 'zh') ? (q.dataset.phZh || '在 PDF 中搜索（Ctrl+F）') : (q.dataset.phEn || 'Search in PDF (Ctrl+F)');
    clearHighlights();
    updateMeta(0,0);
    syncLangRadios();
    safeSet('pgz_lang', STATE.lang);
    renderTopbar();

    // 如果正在看文章：切换语言时切换 PDF
    if(STATE.current){
      renderPdfForCurrent();
      renderList(); // 高亮保持
    }
  }

  function bindLang(){
    if(langEN) langEN.addEventListener('change', () => { if(langEN.checked) applyLang('en'); });
    if(langZH) langZH.addEventListener('change', () => { if(langZH.checked) applyLang('zh'); });
  }

  // ====== Zoom：iframe 内的 PDF 缩放无法像 HTML 那样 transform（跨域/插件渲染）
  // 这里保留你原来的 doc 缩放（如果你的 PDF 容器在 #doc 内，会整体缩放 iframe，体验还可以）
  function setZoom(z){
    const nz = clamp(z, 0.8, 1.3);
    STATE.zoom = nz;
    if(doc){
      doc.style.transform = `scale(${nz})`;
      doc.style.transformOrigin = 'top center';
    }
    if(pane){
      pane.style.paddingBottom = (nz > 1) ? `${Math.round((nz - 1) * 260)}px` : '0px';
    }
    if(zoomLabel) setText(zoomLabel, `${Math.round(nz * 100)}%`);
    safeSet('pgz_zoom', String(nz));
  }

  function bindZoom(){
    if(btnZoomOut) btnZoomOut.addEventListener('click', () => setZoom((STATE.zoom || 1) - 0.1));
    if(btnZoomIn)  btnZoomIn.addEventListener('click', () => setZoom((STATE.zoom || 1) + 0.1));
  }

  function bindPdf(){
    // 这里的“PDF按钮”我理解是打印/导出 PDF（window.print）
    if(btnPdf) btnPdf.addEventListener('click', () => window.print());
  }

  function showView(which){
    if(viewHome) viewHome.style.display = (which === 'home') ? '' : 'none';
    if(viewArticle) viewArticle.style.display = (which === 'article') ? '' : 'none';
    if(viewAbout) viewAbout.style.display = (which === 'about') ? '' : 'none';
    if(btnHome) btnHome.style.display = (which === 'article') ? '' : 'none';
    clearHighlights();
    updateMeta(0,0);
  }

  function escapeHtml(s){
    return (s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function fetchJson(url){
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`Failed to load ${url}`);
    return await r.json();
  }

  function pickTitleForList(item){
    const t = item.title_i18n || item.title;
    const s = t2(t, STATE.lang, '');
    if(s) return s;
    const alt = t2(t, STATE.lang === 'zh' ? 'en' : 'zh', '');
    return alt || (STATE.lang === 'zh' ? '未命名' : 'Untitled');
  }

  function pickDesc(item){
    const d = item.desc_i18n || item.desc;
    const s = t2(d, STATE.lang, '');
    if(s) return s;
    return t2(d, STATE.lang === 'zh' ? 'en' : 'zh', '');
  }

  function renderList(){
    if(!articleListEl) return;

    const items = Array.isArray(STATE.articles) ? STATE.articles.slice() : [];
    if(items.length === 0){
      articleListEl.innerHTML = `
        <li data-lang="en">No articles yet. Add PDFs into /articles and update /articles/articles.json.</li>
        <li data-lang="zh">暂无文章。把 PDF 放入 /articles 并更新 /articles/articles.json。</li>
      `;
      return;
    }

    items.sort((a,b) => (b.date || b.updated || '').localeCompare(a.date || a.updated || ''));

    articleListEl.innerHTML = items.map(a => {
      const id = encodeURIComponent(a.id || '');
      const title = escapeHtml(pickTitleForList(a));
      const date = escapeHtml(a.date || a.updated || '');
      const hasEN = !!(a.en_pdf || (a.pdf && a.pdf.en) || a.en);
      const hasZH = !!(a.zh_pdf || (a.pdf && a.pdf.zh) || a.zh);

      const isActive = !!(STATE.current && STATE.current.id === a.id);

      return `
        <li class="${isActive ? 'active' : ''}" style="text-indent:0;">
          <a href="#/article/${id}">${title}</a>
          <span style="color:#666; font-size:11pt;">${date ? ' ('+date+')' : ''}</span>
          <span style="color:#666; font-size:11pt; margin-left:6px;">
            ${hasEN ? '<span data-lang="en">EN</span>' : ''}
            ${hasZH ? '<span data-lang="zh">中</span>' : ''}
          </span>
        </li>
      `;
    }).join('');
  }

  function setInner(el, html){
    if(!el) return;
    el.innerHTML = html || '';
  }

  function showNotFound(){
    STATE.current = null;
    renderTopbar();
    showView('article');
    renderList();
    setInner(enEl, `<div class="notice">This article ID does not exist in articles.json.</div>`);
    setInner(zhEl, `<div class="notice">该文章 ID 不存在于 articles.json。</div>`);
  }

  function missingLang(which){
    if(which === 'en') setInner(enEl, `<div class="notice">English PDF not provided.</div>`);
    else setInner(zhEl, `<div class="notice">中文 PDF 未提供。</div>`);
  }

  // ====== PDF 路径解析：支持多种写法
  // 推荐：articles.json 里写 pdf.en="file.pdf"（纯文件名）
  // 也兼容你写 "articles/file.pdf"（会自动去重）
  function resolvePdfPath(item, lang){
    const v1 = item && item[lang + '_pdf']; // en_pdf / zh_pdf
    const v2 = item && item.pdf && item.pdf[lang]; // pdf.en / pdf.zh
    const v3 = item && item[lang]; // 兼容旧字段（如果你偷懒写 en:"xxx.pdf" 也行）
    const picked = v1 || v2 || v3 || '';
    if(!picked) return '';
    if(/^https?:\/\//i.test(picked)) return picked;

    // 去掉前导斜杠
    let p = picked.replace(/^\/+/, '');

    // 如果已经带了 "articles/" 前缀，就不要再重复加
    if(p.toLowerCase().startsWith('articles/')) return p;

    return `articles/${p}`;
  }

  function makePdfEmbed(path){
    // 用 iframe 直接打开浏览器 PDF viewer（最省事、最稳）
    // 加上 #toolbar=1 可显示工具栏；你也可以改成 0
    const src = `${path}#toolbar=1&navpanes=0&scrollbar=1`;
    return `
      <div class="pdfWrap" style="width:100%; height: calc(100vh - 180px);">
        <iframe
          class="pdfFrame"
          src="${escapeHtml(src)}"
          style="width:100%; height:100%; border:0; background:#fff;"
          loading="lazy"
        ></iframe>
      </div>
    `;
  }

  function renderPdfForCurrent(){
    const item = STATE.current;
    if(!item) return;

    // 清空两栏
    setInner(enEl, '');
    setInner(zhEl, '');

    const enPath = resolvePdfPath(item, 'en');
    const zhPath = resolvePdfPath(item, 'zh');

    // 你现有结构应该是两块：#articleEN / #articleZH，并用 lang class 控制显示
    if(enPath){
      setInner(enEl, makePdfEmbed(enPath));
    }else{
      missingLang('en');
    }

    if(zhPath){
      setInner(zhEl, makePdfEmbed(zhPath));
    }else{
      missingLang('zh');
    }

    updateMeta(0,0);
  }

  async function renderArticleById(idRaw){
    const id = decodeURIComponent(idRaw || '');
    const item = (STATE.articles || []).find(x => x && x.id === id);
    if(!item){ showNotFound(); return; }

    STATE.current = item;
    showView('article');
    renderTopbar();

    // ✅ 关键：进入文章时重绘列表，让目录高亮当前文章
    renderList();

    // ✅ 不渲染正文标题：这里不做 setArticleTitle 之类任何操作
    renderPdfForCurrent();
  }

  function parseRoute(){
    const h = (location.hash || '#/').replace(/^#/, '');
    const parts = h.split('/').filter(Boolean);
    if(parts.length === 0) return { name:'home' };
    if(parts[0] === 'about') return { name:'about' };
    if(parts[0] === 'articles') return { name:'home' };
    if(parts[0] === 'article' && parts[1]) return { name:'article', id: parts.slice(1).join('/').replace(/^\/+/, '') };
    return { name:'home' };
  }

  async function handleRoute(){
    const r = parseRoute();
    if(r.name === 'about'){
      STATE.current = null;
      showView('about');
      renderTopbar();
      renderList(); // 回到 about 也刷新列表，清掉 active
      return;
    }
    if(r.name === 'article'){
      await renderArticleById(r.id);
      return;
    }
    STATE.current = null;
    showView('home');
    renderTopbar();
    renderList();
  }

  function bindAnchors(){
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', function(){
        clearHighlights();
        updateMeta(0,0);
      });
    });
  }

  function bindHome(){
    if(btnHome) btnHome.addEventListener('click', () => { location.hash = '#/'; });
  }

  async function initData(){
    const data = await fetchJson('articles/articles.json');

    let arr = [];
    let site = null;

    if(Array.isArray(data)){
      arr = data;
    }else{
      if(Array.isArray(data.articles)) arr = data.articles;
      if(data.site && typeof data.site === 'object') site = data.site;
    }

    STATE.site = site || {
      title: { en:'Kalyna Field Notes', zh:'Kalyna 前线笔记' },
      desc:  { en:'A reading tool and archive for OSINT notes, briefs, and references.', zh:'用于整理与阅读 OSINT 笔记、简报与参考资料的归档工具。' }
    };

    STATE.articles = (arr || []).filter(Boolean).map(a => {
      const out = Object.assign({}, a);

      if(out.title && (typeof out.title === 'object')) out.title_i18n = out.title;
      if(out.desc  && (typeof out.desc  === 'object')) out.desc_i18n  = out.desc;

      if(typeof out.title === 'string' && !out.title_i18n) out.title_i18n = { en: out.title, zh: out.title };
      if(typeof out.desc  === 'string' && !out.desc_i18n)  out.desc_i18n  = { en: out.desc,  zh: out.desc  };

      // 兼容老字段：如果你写了 pdf:{en:"x.pdf"}，这里不需要额外处理
      return out;
    });
  }

  async function init(){
    if(!root || !doc) return;

    bindSearch();
    bindLang();
    bindZoom();
    bindPdf();
    bindAnchors();
    bindHome();

    const savedLang = safeGet('pgz_lang');
    applyLang((savedLang === 'zh' || savedLang === 'en') ? savedLang : 'en');

    const savedZoom = parseFloat(safeGet('pgz_zoom') || '');
    setZoom(Number.isFinite(savedZoom) ? savedZoom : 1);

    updateMeta(0,0);

    try{
      await initData();
    }catch(e){
      STATE.articles = [];
      STATE.site = {
        title: { en:'Kalyna Field Notes', zh:'Kalyna 前线笔记' },
        desc:  { en:'A reading tool and archive for OSINT notes, briefs, and references.', zh:'用于整理与阅读 OSINT 笔记、简报与参考资料的归档工具。' }
      };
      STATE.current = null;
      showView('home');
      renderTopbar();
      if(articleListEl){
        articleListEl.innerHTML = `
          <li data-lang="en">Failed to load articles/articles.json</li>
          <li data-lang="zh">无法加载 articles/articles.json</li>
        `;
      }
      return;
    }

    renderTopbar();
    renderList();

    window.addEventListener('hashchange', () => { handleRoute(); });
    await handleRoute();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
