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

  const titleEl = document.getElementById('articleTitle');
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
    if(found === 0){
      setText(meta, STATE.lang === 'zh' ? '0 个结果' : '0 results');
    }else{
      setText(meta, `${idx+1} / ${found} ${STATE.lang === 'zh' ? '处匹配' : 'matches'}`);
    }
  }

  function clearHighlights(){
    if(!doc) return;
    doc.querySelectorAll('mark.hl').forEach(m => {
      m.replaceWith(document.createTextNode(m.textContent));
    });
    STATE.hits = [];
    STATE.activeIdx = -1;
  }

  function getSearchRootElements(){
    const selectorLang = root.classList.contains('lang-en') ? '[data-lang="en"]' : '[data-lang="zh"]';
    const rootView = viewArticle && viewArticle.style.display !== 'none' ? viewArticle
                   : viewAbout && viewAbout.style.display !== 'none' ? viewAbout
                   : viewHome;
    return Array.from((rootView || doc).querySelectorAll(selectorLang));
  }

  function walkTextNodes(el, out){
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if(p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) return NodeFilter.FILTER_REJECT;
        if(p && p.tagName === 'MARK' && p.classList.contains('hl')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n; while((n = walker.nextNode())) out.push(n);
  }

  function setActive(i){
    const hits = STATE.hits;
    if(!hits.length){
      STATE.activeIdx = -1;
      updateMeta(0,0);
      return;
    }
    hits.forEach(m => m.classList.remove('active'));
    STATE.activeIdx = clampMod(i, hits.length);
    const m = hits[STATE.activeIdx];
    m.classList.add('active');
    m.scrollIntoView({ behavior:'smooth', block:'center' });
    updateMeta(hits.length, STATE.activeIdx);
  }

  function highlightAll(query){
    clearHighlights();
    const q2 = normalizeQuery(query);
    if(!q2){ updateMeta(0,0); return; }

    const needle = q2.toLowerCase();
    const targets = getSearchRootElements();

    const textNodes = [];
    targets.forEach(el => walkTextNodes(el, textNodes));

    const hits = [];

    textNodes.forEach(node => {
      const hay = node.nodeValue;
      const low = hay.toLowerCase();
      if(low.indexOf(needle) === -1) return;

      let start = 0;
      const parent = node.parentNode;
      const frag = document.createDocumentFragment();

      while(true){
        const pos = low.indexOf(needle, start);
        if(pos === -1) break;

        if(pos > start) frag.appendChild(document.createTextNode(hay.slice(start, pos)));

        const m = document.createElement('mark');
        m.className = 'hl';
        m.textContent = hay.slice(pos, pos + q2.length);
        frag.appendChild(m);
        hits.push(m);

        start = pos + q2.length;
      }

      if(start < hay.length) frag.appendChild(document.createTextNode(hay.slice(start)));
      parent.replaceChild(frag, node);
    });

    STATE.hits = hits;
    if(hits.length) setActive(0);
    else updateMeta(0,0);
  }

  function bindSearch(){
    if(btnFind) btnFind.addEventListener('click', () => highlightAll(q.value));
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
      q.value = '';
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
    if(q) q.placeholder = (STATE.lang === 'zh') ? q.dataset.phZh : q.dataset.phEn;
    clearHighlights();
    updateMeta(0,0);
    syncLangRadios();
    safeSet('pgz_lang', STATE.lang);
    renderTopbar();
  }

  function bindLang(){
    if(langEN) langEN.addEventListener('change', () => { if(langEN.checked) applyLang('en'); });
    if(langZH) langZH.addEventListener('change', () => { if(langZH.checked) applyLang('zh'); });
  }

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
        <li data-lang="en">No articles yet. Add DOCX into /articles and update /articles/articles.json.</li>
        <li data-lang="zh">暂无文章。把 DOCX 放入 /articles 并更新 /articles/articles.json。</li>
      `;
      return;
    }

    items.sort((a,b) => (b.date || b.updated || '').localeCompare(a.date || a.updated || ''));

    articleListEl.innerHTML = items.map(a => {
      const id = encodeURIComponent(a.id || '');
      const title = escapeHtml(pickTitleForList(a));
      const date = escapeHtml(a.date || a.updated || '');
      const hasEN = !!(a.en || (a.docx && a.docx.en));
      const hasZH = !!(a.zh || (a.docx && a.docx.zh));
      return `
        <li style="text-indent:0;">
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

  function setArticleTitle(titleAny){
    if(!titleEl) return;
    const t = escapeHtml(titleAny || (STATE.lang === 'zh' ? '未命名' : 'Untitled'));
    titleEl.innerHTML = `<span data-lang="en">${t}</span><span data-lang="zh">${t}</span>`;
  }

  function showNotFound(){
    STATE.current = null;
    renderTopbar();
    setArticleTitle(STATE.lang === 'zh' ? '未找到文章' : 'Article not found');
    setInner(enEl, `<div class="notice">This article ID does not exist in articles.json.</div>`);
    setInner(zhEl, `<div class="notice">该文章 ID 不存在于 articles.json。</div>`);
  }

  function missingLang(which){
    if(which === 'en') setInner(enEl, `<div class="notice">English version not provided.</div>`);
    else setInner(zhEl, `<div class="notice">中文版本未提供。</div>`);
  }

  async function loadDocxToHtml(path){
    if(!window.mammoth) throw new Error('mammoth not loaded');
  
    const r = await fetch(path, { cache:'no-store' });
    if(!r.ok) throw new Error(`Failed to fetch ${path}`);
  
    const buf = await r.arrayBuffer();
  
    const options = {
      styleMap: [
        "p[style-name='Title'] => h1.kfn-title:fresh",
        "p[style-name='Heading 1'] => h2.kfn-h2:fresh",
        "p[style-name='Heading 2'] => h3.kfn-h3:fresh",
        "p[style-name='Heading 3'] => h4.kfn-h4:fresh",
  
        "p[style-name='Quote'] => blockquote.kfn-quote:fresh",
  
        "p[style-name='List Paragraph'] => p.kfn-li:fresh"
      ],
      convertImage: window.mammoth.images.inline(function(image) {
        return image.read("base64").then(function(imageBuffer) {
          return { src: "data:" + image.contentType + ";base64," + imageBuffer };
        });
      })
    };
  
    const res = await window.mammoth.convertToHtml({ arrayBuffer: buf }, options);
    return (res.value || '').trim();
  }

  function resolveDocPath(item, lang){
    const v1 = item && item[lang];
    const v2 = item && item.docx && item.docx[lang];
    const picked = v1 || v2 || '';
    if(!picked) return '';
    if(/^https?:\/\//i.test(picked)) return picked;
    return `articles/${picked.replace(/^\/+/, '')}`;
  }

  async function renderArticleById(idRaw){
    const id = decodeURIComponent(idRaw || '');
    const item = (STATE.articles || []).find(x => x && x.id === id);
    if(!item){ showNotFound(); return; }

    STATE.current = item;
    showView('article');

    const titleForUI = pickTitleForList(item);
    setArticleTitle(titleForUI);
    setInner(enEl, '');
    setInner(zhEl, '');

    renderTopbar();

    const enPath = resolveDocPath(item, 'en');
    const zhPath = resolveDocPath(item, 'zh');

    let enOk = false;
    let zhOk = false;

    if(enPath){
      if(enPath.toLowerCase().endsWith('.doc')){
        setInner(enEl, `<div class="notice">.doc is not supported on static hosting. Please convert to .docx.</div>`);
      }else{
        try{
          const html = await loadDocxToHtml(enPath);
          setInner(enEl, html || `<div class="notice">Empty content.</div>`);
          enOk = true;
        }catch(e){
          setInner(enEl, `<div class="notice">Failed to load EN DOCX: ${escapeHtml(String(e.message || e))}</div>`);
        }
      }
    }

    if(zhPath){
      if(zhPath.toLowerCase().endsWith('.doc')){
        setInner(zhEl, `<div class="notice">.doc 在静态托管下无法可靠解析，请转为 .docx。</div>`);
      }else{
        try{
          const html = await loadDocxToHtml(zhPath);
          setInner(zhEl, html || `<div class="notice">内容为空。</div>`);
          zhOk = true;
        }catch(e){
          setInner(zhEl, `<div class="notice">加载中文 DOCX 失败：${escapeHtml(String(e.message || e))}</div>`);
        }
      }
    }

    if(!enPath) missingLang('en');
    if(!zhPath) missingLang('zh');

    if(!enOk && !zhOk && (enPath || zhPath)){
      updateMeta(0,0);
    }
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

      if(out.docx && typeof out.docx === 'object'){
        if(!out.en && out.docx.en) out.en = out.docx.en;
        if(!out.zh && out.docx.zh) out.zh = out.docx.zh;
      }
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

    window.addEventListener('hashchange', () => { handleRoute(); });
    await handleRoute();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
